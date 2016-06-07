'use strict';

console.log('- Starting.');

var MongoClient = require('mongodb').MongoClient;
var Q = require('q');
var Slack = require('slack-node');
var futures = require('futures');
var request = require('request');

var slack = new Slack();

function postToSlack(checkin) {
  var deferred = Q.defer();
  var exec = require('child_process').exec;

  function done(error, stdout, stderr) {
    deferred.resolve();
  }
  var payload = {
    "username": "Untappd",
    "text": "" +
      checkin.user.user_name + " is drinking <https://untappd.com/beer/" + checkin.beer.bid + "|" + checkin.beer.beer_name.replace('\'', '’') + "> " +
      "(" + checkin.beer.beer_style.replace('\'', '’') + ", " + checkin.beer.beer_abv + "% ABV) " +
      "by <https://untappd.com/brewery/" + checkin.brewery.brewery_id + "|" + checkin.brewery.brewery_name.replace('\'', '’') + ">.\n" + 
      "They rated it a " + checkin.rating_score + 
        (checkin.checkin_comment ?
          " and said \"" + checkin.checkin_comment.replace('\'', '’') + "\". " :
          ". ") +
      "<https://untappd.com/user/" + checkin.user.user_name + "/checkin/" + checkin.checkin_id + "|Toast »>"
  };

  if (checkin.media.count) {
    payload.attachments = [{
      fallback: "Checkin photo",
      image_url: checkin.media.items[0].photo.photo_img_lg
    }];
  }

  var webhookURLs = process.env.SLACK_WEBHOOK_URL.split(',');
  webhookURLs.forEach(function(webhookURL) {
    process.stdout.write('Sending payload to Slack: ' + JSON.stringify(payload));
    slack.setWebhook(webhookURL);
    slack.webhook(payload, function(err, response) {
      if (err) {
        process.stdout.write('Error from Slack: ' + JSON.stringify(response));
      } else {
        process.stdout.write('Response from Slack: ' + JSON.stringify(response));
      }
    });

  });

  return deferred.promise;
}

function untappdUser(username) {
  var deferred = Q.defer();
  request({
    json: true,
    url: 'https://api.untappd.com/v4/user/info/' + username + '?client_id=' + process.env.UNTAPPD_CLIENT_ID + '&client_secret=' + process.env.UNTAPPD_CLIENT_SECRET
  }, function(err, res, body) {
    deferred.resolve(body);
  });
  return deferred.promise;
}

var checkins = [];
var users = process.env.UNTAPPD_USERS.split(',');
var userPromises = [];

users.forEach(function(user) {
  userPromises.push(untappdUser(user).then(function(res) {
    if (res.response.user && res.response.user.checkins && res.response.user.checkins.items) {
      var mostRecentCheckin = res.response.user.checkins.items[0];
      if (mostRecentCheckin) {
        checkins.push(mostRecentCheckin);
      }
    }
  }));
});

console.log('- Connecting to Mongo.');

MongoClient.connect(process.env.MONGO_URL, function(err, db) {
  if (err) throw err;
  console.log('- No DB connection error.');
  Q.all(userPromises).then(function() {
    console.log('- All promises resolved.');
    var sequence = futures.sequence();
    checkins.forEach(function(checkin) {
      sequence.then(function(next) {
        db.collection('checkins').find({
          checkin_id: checkin.checkin_id
        }).toArray(function(err, existingCheckins) {
          if (existingCheckins.length) {
            return next();
          }
          db.collection('checkins').save({
            checkin_id: checkin.checkin_id
          }, function(err, result) {
            console.log('- Added checkin', result.checkin_id + '.');
            postToSlack(checkin).then(function() {
              next();
            });
          });
        });
      });
    });
    sequence.then(function() {
      console.log('Done.');
      process.exit();
    });
  });
});
