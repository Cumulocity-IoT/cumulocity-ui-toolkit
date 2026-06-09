# Smart Views Plugin

Registers a route at `smart-view/:deviceId` that reads the device ID from the URL and loads the corresponding managed object using the Cumulocity Inventory API.

## Usage

Add the `SmartViewsPluginProviders` to your application providers and navigate to `/smart-view/<deviceId>`.
