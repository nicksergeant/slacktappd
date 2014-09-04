'use strict';

var futures = require('futures');
var MongoClient = require('mongodb').MongoClient;
var request = require('request');
var Q = require('q');

function postToSlack(checkin) {
  var deferred = Q.defer();
  var sys = require('sys');
  var exec = require('child_process').exec;
  function done(error, stdout, stderr) {
    deferred.resolve();
  }
  var payload = {
    "username": "Untappd",
    "text": "<" + "https://untappd.com/user/" +
      checkin.user.user_name + "/checkin/" +
      checkin.checkin_id + "|" +
      checkin.user.user_name + " is drinking> a <https://untappd.com/beer/" +
      checkin.beer.bid + "|" +
      checkin.beer.beer_name + "> by <https://untappd.com/brewery/" +
      checkin.brewery.brewery_id + "|" +
      checkin.brewery.brewery_name + ">."
  };
  exec('curl -X POST --data-urlencode \'payload=' + JSON.stringify(payload) + '\' ' + process.env.SLACK_WEBHOOK_URL, done);
  return deferred.promise;
}
function untappdUser(username) {
  var deferred = Q.defer();
  request({
    json: true,
    strictSSL: false,
    url: 'http://api.untappd.com/v4/user/info/' + username + '?client_id=' + process.env.UNTAPPD_CLIENT_ID + '&client_secret=' + process.env.UNTAPPD_CLIENT_SECRET
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
    if (res.response.user && res.response.user.checkins && res.response.user.checkins.length) {
      var mostRecentCheckin = res.response.user.checkins.items[0];
      checkins.push(mostRecentCheckin);
    }
  }));
});

var mongoUri = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || 'mongodb://localhost/slacktappd';
MongoClient.connect(mongoUri, function(err, db) {
  Q.all(userPromises).then(function() {
    var sequence = futures.sequence();
    checkins.forEach(function(checkin) {
      sequence.then(function(next) {
        db.collection('checkins').find({ checkin_id: checkin.checkin_id }).toArray(function(err, existingCheckins) {
          if (existingCheckins.length) { return next(); }
          db.collection('checkins').save({ checkin_id: checkin.checkin_id }, function(err, result) {
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
