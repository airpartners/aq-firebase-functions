# Firebase Cloud Functions

## Getting Started

Most of this info is taken from the [Firebase Cloud Functions "Get Started" guide](https://firebase.google.com/docs/functions/get-started). This example is a bit simpler and doesn't require using Cloud Firestore. It also skips some steps like "Create a Firebase Project" because we already have one. (:

### [Install the Firebase CLI](https://firebase.google.com/docs/cli#install_the_firebase_cli)

`npm install -g firebase-tools`

### Login to Firebase

`firebase login`

You'll need to use the adeairquality@gmail.com login because that account owns our Firebase project.

### Initialize Firebase

**NOTE: you can skip this section since the config files are already tracked in git, however, if you need to overwrite it (e.g. to link to a different project), delete `firebase.json` and `.firebaserc` first**

`cd path/to/your/local/aq-firebase-functions`<br />
`firebase init functions`

1. Select "Use and existing project" and choose "airpartners-ade"
2. Up to you but our standard is to use JavaScript.
3. Again preference but it's recommended to use ESLint.
4. If it asks you if you want to overwrite any files:<br/>
  a. package.json - yes<br/>
  b. .eslintrc.json - yes<br/>
  c. functions/index.js - default no, but if you want to for some reason then go ahead<br/>
  d. .gitignore - default no, but if you want to for some reason then go ahead<br/>
5. Once again, up to you but it's recommended to install dependencies with npm now. You can always just run `npm install` afterwards though.

### Write your first function

This hello world function is probably the easiest. Gets you familiar with the request/response concept and what it means to `console.log` something.

```javascript
const functions = require('firebase-functions');

// Create and Deploy Your First Cloud Functions
// https://firebase.google.com/docs/functions/write-firebase-functions

exports.helloWorld = functions.https.onRequest((request, response) => {
  console.log("Hello console!");
  response.send("Hello from Firebase!");
});
```

### Test your function with the emulator

`firebase emulators:start`

You should see something printed to the terminal that says:

`✔  All emulators ready! View status and logs at http://localhost:4000`

This url is where the emulator is running and where you can find the logs. You should also see something printed to the terminal that says:

`✔  functions[helloWorld]: http function initialized (http://localhost:5001/airpartners-ade/us-central1/helloWorld).`

This is the url you want to use to trigger your function. You should see the response "Hello from Firebase!" in your browser window. If you go to the emulator url mentioned above and check the "Logs" tab you should see "Hello console!" printed to the log output. The whole output should look something like:

```
function[helloWorld] Beginning execution of "helloWorld"
function[helloWorld] Hello console!
function[helloWorld] Finished "helloWorld" in ~1s
```

You can type Ctrl^C in your terminal to stop the emulators. Some times it takes a few seconds.

### Deploy your function

`firebase deploy --only functions`

You might get an error like: `⚠  functions: Upload Error: HTTP Error: 403, Unknown Error`. If this happens try running `firebase login` again. If you are still having trouble try `firebase deploy --only functions --debug` to see more info about what's happening.

You can now try triggering your deployed function. The url you need to enter in the browser should look like: https://us-central1-airpartners-ade.cloudfunctions.net/helloWorld. You can confirm this by looking through the terminal printouts for a line like:

`Function URL (helloWorld): https://us-central1-airpartners-ade.cloudfunctions.net/helloWorld`

You can also find this url by going to the "Functions" page of our [Firebase Project Console](https://console.firebase.google.com/project/airpartners-ade/overview). Look for the url in the "Trigger" column of the "Dashboard" tab. After you access this url, you should see the response "Hello from Firebase!" in your browser window. If you go back to the "Functions" page mentioned above and check the "Logs" tab you should see "Hello console!" printed to the log output, sandwiched by start and finish execution messages.
