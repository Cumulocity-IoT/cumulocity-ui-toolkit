# Cypress Testing Guide

## Running a test locally

### Prerequisites

0. Install dependencies (on root level `npm i`, then cd into `/test` and also run `npm i`there.)
1. Ensure that a local server is running with the package to be tested. Ensure that `TENANT`is targeting UI Guild tenant (using `export TENANT=...`) and `APP`is set to `cockpit-test` (using `export APP=cockpit-test`).
2. The Cypress configuration must point to the same tenant as the local server.
3. Make sure to use the correct test script as the shell and remotes query param need to match between the locally running Angular dev server and the cypress test configuration.

### Configuration

- Before running the tests locally, you need to configure the `C8Y_USERNAME` and `C8Y_PASSWORD` in one of the following files:
  - `base.config.ts` (for headless testing)
  - `cypress.config.ts` (for visual testing)
- Per default the test is targeted at the UI Guild tenant
    - The application cockpit-test is used
    - This app is meant to be left empty, meaning no plugins shall be installed there as otherwise conflicts might happen between versions of the same plugin (ala testing against the old version )

### Steps to Run Tests

1. Start the local server for the application under test (e.g. `npm run serve:reminder`).
2. Verify that the Cypress configuration is correctly set to match the tenant of the local server.
3. Run the Cypress tests using the appropriate command. The scripts can be found in the package.json file (e.g. `npm run test:reminder`).

## Running tests inside a build job

1. Make sure that the cypress test user is setup - username and password are secrets which need to be set as env variables `C8Y_USERNAME` and `C8Y_PASSWORD`.
2. Checkout the branch and start the Angular dev server (use wait-on to really make sure it has started!). Configure `NODE_OPTIONS: --max_old_space_size=4096` as env param to prevent Heap overflow issues.
3. Run the test using  

## Extend with a new plugin

1. Create a new test file under `cypress/e2e`. The convention is that the test file's name must match *{name from package.json}*.cy.ts. This is how it will be configured in the `config`.
2. Add a new config file under `config`.
3. Add a new script in the `test/package.json`.

## Add reusable commands

- You can add those under `cypress/support/commands.ts`.