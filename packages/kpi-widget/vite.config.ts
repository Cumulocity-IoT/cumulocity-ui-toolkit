// Local dev with hot reload (`pnpm run dev`): Vite + OXC via the ui-sdk; builds stay on the devkit.
import { c8yVite } from '@cumulocity-iot/ui-sdk/vite';
import config from './cumulocity.config';

export default c8yVite({ config });
