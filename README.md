# Firebase Cloud Functions <!-- omit in toc -->

<!-- TOC -->
- [Getting Started](#getting-started)
  - [Install the Firebase CLI](#install-the-firebase-cli)
  - [Login to Firebase](#login-to-firebase)
  - [Initialize Firebase](#initialize-firebase)
  - [Write your first function](#write-your-first-function)
  - [Test your function with the emulator](#test-your-function-with-the-emulator)
  - [Deploy your function](#deploy-your-function)
- [Unit testing with mocha](#unit-testing-with-mocha)
- [GitHub Workflows](#github-workflows)
  - [Continuous integration (CI)](#continuous-integration-ci)
  - [Continuous deployment (CD)](#continuous-deployment-cd)
- [Adding Dependencies](#adding-dependencies)
- [Scheduling Functions](#scheduling-functions)
  - [For an existing project](#for-an-existing-project)
  - [For a new project](#for-a-new-project)
  - [PubSub emulator](#pubsub-emulator)
- [Realtime Database](#realtime-database)
  - [Resources](#resources)
  - [Setup admin SDK and credentials](#setup-admin-sdk-and-credentials)
  - [Initializing emulator](#initializing-emulator)
  - [Writing to the database](#writing-to-the-database)
- [External APIs](#external-apis)
  - [Secret Manager](#secret-manager)
    - [Why not just use environment variables](#why-not-just-use-environment-variables)
    - [Creating a secret](#creating-a-secret)
    - [Giving our project permissions](#giving-our-project-permissions)
    - [Accessing a secret in a Cloud Function](#accessing-a-secret-in-a-cloud-function)
  - [Basic QuantAQ Fetch Example](#basic-quantaq-fetch-example)
<!-- /TOC -->

## Getting Started

Most of this info is taken from the [Firebase Cloud Functions "Get Started" guide](https://firebase.google.com/docs/functions/get-started). This example is a bit simpler and doesn't require using Cloud Firestore. It also skips some steps like "Create a Firebase Project" because we already have one. (:

### Install the Firebase CLI

[Docs](https://firebase.google.com/docs/cli#install_the_firebase_cli)

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
5. Once again, up to you but it's recommended to install dependencies with npm now. You can always just run `npm install` afterwards though. You need to be in the `/functions` directory if/when you do.

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

NOTE: We have unit testing now! See [Unit testing with mocha](#unit-testing-with-mocha).
NOTE: We have continuous integration now! See [Continuous integration (CI)](#continuous-integration-ci).
Manual testing is still important though! See the following instructions for an example of how to test things with the emulators. You should always do this before pushing to test things that can't be unit tested easily.

`firebase emulators:start`
or
`npm run serve`

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

NOTE: Deployment is handled manually now with GitHub workflows! See [Continuous deployment (CD)](#continuous-deployment-cd).

`firebase deploy --only functions` to deploy all functions in index.js<br/>
`firebase deploy --only functions:writeDB,functions:helloWorld` to deploy only writeDB and helloWorld functions<br/>
[More info here](https://firebase.google.com/docs/functions/manage-functions)

You might get an error like: `⚠  functions: Upload Error: HTTP Error: 403, Unknown Error`. If this happens try running `firebase login` again. If you are still having trouble try `firebase deploy --only functions --debug` to see more info about what's happening.

You can now try triggering your deployed function. The url you need to enter in the browser should look like: https://us-central1-airpartners-ade.cloudfunctions.net/helloWorld. You can confirm this by looking through the terminal printouts for a line like:

`Function URL (helloWorld): https://us-central1-airpartners-ade.cloudfunctions.net/helloWorld`

You can also find this url by going to the "Functions" page of our [Firebase Project Console](https://console.firebase.google.com/project/airpartners-ade/overview). Look for the url in the "Trigger" column of the "Dashboard" tab. After you access this url, you should see the response "Hello from Firebase!" in your browser window. If you go back to the "Functions" page mentioned above and check the "Logs" tab you should see "Hello console!" printed to the log output, sandwiched by start and finish execution messages.

## Unit testing with mocha

NOTE: Make sure you are in the `./functions` folder.

`npm run test`

All unit tests are in the `./functions/test` folder. This project uses mocha with chai assertions to execute unit testing. Additionally, it uses firebase-functions-test to set up access to our test database for running online tests. In order to authenticate your access, you'll need our service account key file. The expected location of the file is in the `./functions/test` folder. If the file doesn't exist at this location, the online tests will be skipped. To get the file, log in to the adeairquality@gmail.com account and go to Google Keep. Find the note with title: airpartners-ade-964cc0280add.json. Add a file with this name and the body of the note as its contents to the `./functions/test` folder.

If you have to generate a new service account key file for some reason, make sure to update all the test files to use it. You could also just rename it to match airpartners-ade-964cc0280add.json which might be better actually. We don't really need to keep track of them. We just need to make sure unauthorized people can't access them.

## GitHub Workflows

Go to the [Actions tab of this repository](https://github.com/airpartners/aq-firebase-functions/actions) to see all current and previous jobs, logs, and statuses.

It is highly recommended to run `npm test` and `npm run lint`, before pushing to any branch. Otherwise, CI/CD workflows may fail unexpectedly causing you to add a fixing commit. NOTE: Make sure you are in the `./functions` folder when running these commands.

### Continuous integration (CI)

Although unit tests will run automatically, it's still important to do manual testing with the emulators. See [Test your function with the emulator](#test-your-function-with-the-emulator). Additionally, use `npm run lint` locally to ensure you do not have any linter warnings or errors. GitHub workflows testing jobs will fail if there are any warnings or errors from `npm run lint`. Use `// eslint-disable-next-line` to suppress warnings or errors sparingly.

Online tests do not run in GitHub workflows since, as of now, it's not clear how to include access to our service account key file without making it publicly available in our repo. See [Unit testing with mocha](#unit-testing-with-mocha) for how to get the service account key file to run online tests locally.

Any time a push is made to a feature branch, the GitHub workflow at `./.github/workflows/feature.yml` will run. After installing dependencies, it will run `npm run lint` and `npm test`. Any issues will cause a failure and prevent merging a pull request to master without using admin privileges to override this check. To view and/or edit these branch protection settings go to [Setting > Branches](https://github.com/airpartners/aq-firebase-functions/settings/branches).

### Continuous deployment (CD)

After any push to master (except changes that only affect README.md), the GitHub workflow at `./.github/workflows/main.yml` will run. After installing dependencies, it will run `npm test`. Any issues will cause a failure and the changes will not be deployed. It doesn't run `npm run lint` explicitly because it is run as a part of the `firebase deploy --only functions` command before deploying.

## Adding Dependencies

NOTE: Make sure you are in the `./functions` folder before running `npm install`.

Here is an example with the `npm` package `base-64`.

`cd path/to/your/local/aq-firebase-functions`<br/>
`cd functions`<br/>
`npm install --save base-64`

This will update your `functions/package.json` with base-64 as a required dependency. If it's not in the "dependencies" field of your `functions/package.json` then your deployment will fail if your code uses it. Afterwards, add the below line to your index.js file (or whichever other file needs the dependency). Obviously, you can name it whatever you want, the base64 nomenclature is just copied from somewhere else.

```javascript
const base64 = require('base-64');
```

Adding an example here of how to use the dependency just for completeness but it's standard JS syntax just like the `require` statement above.

```javascript
const token = 'Basic ' + base64.encode(USERNAME + ":" + PASSWORD);
```

## Scheduling Functions

Google Cloud's instructions live [here](https://firebase.google.com/docs/functions/schedule-functions).

### For an existing project

You most likely just need to write a scheduled function in your index.js file and then run `firebase deploy --only functions:nameOfYourFunction`. You may need to run `firebase login` first if you get a 403 error. Here is a basic tested example.

```javascript
exports.scheduledFunction = functions.pubsub.schedule('every 5 minutes').onRun((context) => {
  console.log('This will be run every 5 minutes!');
  return null;
});
```

And the command to deploy it is `firebase deploy --only functions:scheduledFunction`.

### For a new project

If doing this for the first time with a new project, make sure you have the Cloud Pub/Sub API and Cloud Scheduler API enabled. You can check by looking at the [Google Cloud Console APIs dashboard](https://console.cloud.google.com/apis/dashboard). You also need to have an App Engine connected to the project. All you need to do is search for App Engine in the main search bar while in your project's Google Cloud Console. If you haven't already created one there will be an auto-complete suggestion that has a shopping cart icon and says "App Engine." Click that and it should create one for you. You'll see a page that says "Your App Engine application has been created." If you have already created one, you'll see an auto-complete suggestion that has a target-like icon instead. If you click this you should still see that page with the same message.

### PubSub emulator

If you get a message like this `i  functions[scheduledFunction]: function ignored because the pubsub emulator does not exist or is not running` try executing `firebase init emulators` and selecting the PubSub emulator.

## Realtime Database

### Resources

[Add the Firebase Admin SDK to your server](https://firebase.google.com/docs/admin/setup)<br/>
[Introduction to the Admin Database API](https://firebase.google.com/docs/database/admin/start)<br/>
[Saving Data](https://firebase.google.com/docs/database/admin/save-data)

### Setup admin SDK and credentials

You need to add the following to the index.js file to access the realtime database:

```
const admin = require('firebase-admin');

admin.initializeApp();
```

When calling `admin.initializeApp()` with no input, the default configuration is used. This sets the database url to https://airpartners-ade.firebaseio.com. For the credentials, it looks at the file path specified by the GOOGLE_APPLICATION_CREDENTIALS environment variable. If you want to be able to test your function locally you need to create this environment variable and set it equal to the path of your service account JSON file. This should be a non-relative local path. To download the file, go the to the [Firebase Project Console](https://console.firebase.google.com/project/airpartners-ade/overview). Click the Settings (gear icon) button next to "Project Overview" in the top left. Select "Users and Permissions" then go to the "Service accounts" tab. Click "Generate new private key" and follow the instructions. After the download is complete, add something like the following to your .bashrc or equivalent so the environment variable will always exist. You can also use the existing service account key file by logging into the adeairquality@gmail.com account and going to Google Keep. There should be a note title serviceAccountKey.json.

`export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/local/service/account/.json"`

### Initializing emulator

Execute `firebase init emulators` and select the `Database` emulator.

### Writing to the database

Here is a basic tested example. The resource on saving data above has more detail.

```javascript
const admin = require('firebase-admin');
const functions = require('firebase-functions');

admin.initializeApp();

exports.writeDB = functions.https.onRequest((request, response) => {
  console.log("Hello console! I'm trying to write to the realtime db...");
  admin.database().ref("users").set({
    lucky: {
      date_of_birth: "February 12, 1984",
      full_name: "Lakhvinder Jordan"
    },
    nina: {
      date_of_birth: "December 9, 1906",
      full_name: "Nina Tchirkova"
    }
  });
  response.send("Wrote something to realtime db!");
});
```

## External APIs

### Secret Manager

#### Why not just use environment variables

You can deploy environment variables with a function but the [guide](https://cloud.google.com/functions/docs/env-var) on it recommends using Secret Manager for API keys. It's a bit confusing because the guide is for Google Cloud Functions but this [guide for Firebase Cloud Functions](https://firebase.google.com/docs/functions/config-env) (which seems to use Google Cloud Functions) uses API key storage as an example for using Firebase environment configuration. Better to be safe than sorry so we're using Secret Manager for now.

#### Creating a secret

Docs: [Creating and accessing secrets](https://cloud.google.com/secret-manager/docs/creating-and-accessing-secrets)

In the docs linked above, it's pretty simple to figure out how to create a secret using the Web UI. Make sure you're logged in to the adeairquality@gmail.com account in the Google Cloud Console and you're in the airpartners-ade project.

#### Giving our project permissions

This is already done so you can skip this step. Not sure if this is the "right" way to do things but it works. In the Secret Manager Web UI, you need to add our project service account, airpartners-ade@appspot.gserviceaccount.com, as a Secret Manager Secret Accessor. We also added the Firebase Admin SDK service account, firebase-adminsdk-ewvat@airpartners-ade.iam.gserviceaccount.com, which is necessary for it to work in the emulator.

#### Accessing a secret in a Cloud Function

Once you've created a secret and added the permissions for your service account, switch over to the Node.js tab in the "Access a secret version section" of the docs linked above in [Creating a secret](#creating-a-secret). First you need to install the dependency with the below commands. See [Adding Dependencies](#adding-dependencies) for more info.

`cd path/to/your/local/aq-firebase-functions`<br/>
`cd functions`<br/>
`npm install --save @google-cloud/secret-manager`

And below is the basic tested example. Of course, as the comment says, don't ever print a real API key to the console in a production environment. This code is only for testing purposes. We'll leave version 1 of the API key as `test_fake_key` and keep it enabled for future testing purposes.

```javascript
/**
 * TODO(developer): Uncomment the name var with the "latest" param in the path and
 * comment out the existing name var declaration after testing. Don't forget to remove
 * the statement logging the payload first!
 */
// const name = 'projects/airpartners-ade/secrets/QUANTAQ_APIKEY/versions/latest';
const name = 'projects/airpartners-ade/secrets/QUANTAQ_APIKEY/versions/1';

// Imports the Secret Manager library
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

// Instantiates a client
const client = new SecretManagerServiceClient();

async function accessSecretVersion() {
  const [version] = await client.accessSecretVersion({
    name: name,
  });

  // Extract the payload as a string.
  const payload = version.payload.data.toString();

  // WARNING: Do not print the secret in a production environment - this
  // snippet is showing how to access the secret material.
  console.info(`Payload: ${payload}`);
}

exports.accessSecret = functions.https.onRequest((request, response) => {
  console.log("Hello console! I'm trying to access a secret...");
  accessSecretVersion().catch(console.error);
  response.send("Secret access running asynchronously! The data will be printed to the console when it's done.");
})
```

If you get an error like `Could not load the default credentials` when running in the emulator, make sure you have your GOOGLE_APPLICATION_CREDENTIALS environment variable set. See [Setup admin SDK and credentials](#setup-admin-sdk-and-credentials) for more info.

### Basic QuantAQ Fetch Example

The API is documented on Postman. This [link](https://app.getpostman.com/join-team?invite_code=f3bd33af9d106fe3b924d46a9aa48ee7&ws=140c7bd0-dbfc-4933-82f3-d42c38c2f2dd) is an invitation to the workspace. It doesn't contain any sensitive information. There is also Python documentation [here](https://github.com/quant-aq/py-quantaq) and [here copied to our GitHub organization](https://github.com/airpartners/py-quantaq).

Here is a tested example:

```javascript
const fetch = require('node-fetch');

const base64 = require('base-64');
const BASE_URL = "https://quant-aq.com/device-api/v1/devices";
const LIMIT = 20;
const USERNAME = process.env.QUANTAQ_APIKEY;
const PASSWORD = "";
const token = 'Basic ' + base64.encode(USERNAME + ":" + PASSWORD);

function getEndpoint(deviceId = 'SN000-072', page = 1, perPage = 2) {
  return `${BASE_URL}/${deviceId}/data/?page=${page}&per_page=${perPage}&limit=${LIMIT}`;
}

exports.fetchQuantAQ = functions.https.onRequest((request, response) => {
  console.log("Hello console! I'm trying to fetch data from QuantAQ...");
  fetch(getEndpoint(), {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': token,
    },
    credentials: 'include',
    method: 'GET'
  }).then(res => res.json())
    .then(data => console.log(data))
    .catch(error => console.log(error));
  response.send("Fetch is running asynchronously! The data will be printed to the console when it's done.");
})
```