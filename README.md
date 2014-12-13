slacktappd
==========

A tiny little app to post Untappd checkins to Slack.

1. `heroku create`
2. `heroku config:add UNTAPPD_USERS=nicksergeant,mikedup`
3. `heroku config:add UNTAPPD_CLIENT_ID=<untappd_api_client_id>`
4. `heroku config:add UNTAPPD_CLIENT_SECRET=<untappd_api_client_secret>`
5. `heroku config:add SLACK_WEBHOOK_URL=<slack_webhook_url>,<slack_webhook_url2>`
6. `heroku addons:add mongohq:sandbox`
7. `heroku addons:add scheduler:standard`
8. `heroku addons:open scheduler`
9. Add job -> `node index.js` -> `Every 10 minutes`
