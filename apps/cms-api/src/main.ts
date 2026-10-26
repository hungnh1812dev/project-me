import { Logger } from '@nestjs/common';

import { bootstrap } from './Bootstrap.setup';

bootstrap(process.env).catch((error: unknown) => {
  // Config errors list keys and rules only, never values.
  new Logger('Bootstrap').fatal(
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
