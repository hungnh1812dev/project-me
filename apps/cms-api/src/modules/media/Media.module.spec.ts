import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { devEnv } from '../../../test/fixtures/Env.fixture';
import { loadAppConfig } from '../../config/AppConfig.setup';
import { MEDIA_PROVIDERS } from '../../config/Config.constants';
import { FakeMediaStorage } from './adapters/Fake.adapter';
import { LocalMediaStorage } from './adapters/Local.adapter';
import { createMediaStorage, MEDIA_STORAGE_FACTORIES } from './Media.module';

describe('createMediaStorage', () => {
  it('uses the fake storage for MEDIA_PROVIDER=fake', () => {
    expect(createMediaStorage(loadAppConfig(devEnv()))).toBeInstanceOf(FakeMediaStorage);
  });

  it('refuses the fake storage in production', () => {
    const config = { ...loadAppConfig(devEnv()), isProduction: true };
    expect(() => createMediaStorage(config)).toThrow(/production/);
  });

  it('has a factory for every MEDIA_PROVIDERS entry and no other', () => {
    expect(Object.keys(MEDIA_STORAGE_FACTORIES).sort()).toEqual([...MEDIA_PROVIDERS].sort());
  });

  it('throws for a provider with no factory, including inherited names', () => {
    const config = loadAppConfig(devEnv());
    for (const provider of ['s3', 'constructor']) {
      const unknown = { ...config, media: { ...config.media, provider } };
      expect(() => createMediaStorage(unknown as never)).toThrow(/No media storage/);
    }
  });

  describe('local provider', () => {
    let directory: string;
    const localEnv = () =>
      devEnv({
        MEDIA_PROVIDER: 'local',
        MEDIA_LOCAL_DIR: directory,
        MEDIA_LOCAL_PUBLIC_URL: 'http://localhost:8080/api/v1/media-files',
      });

    beforeEach(() => {
      directory = mkdtempSync(join(tmpdir(), 'abyss-media-module-'));
    });
    afterEach(() => rmSync(directory, { recursive: true, force: true }));

    it('uses the local storage for MEDIA_PROVIDER=local', () => {
      expect(createMediaStorage(loadAppConfig(localEnv()))).toBeInstanceOf(LocalMediaStorage);
    });

    it('refuses production unless the config carries the opt-in', () => {
      const config = loadAppConfig(localEnv());
      const production = { ...config, isProduction: true };
      expect(() => createMediaStorage(production)).toThrow(/production/);
      const optedIn = {
        ...production,
        media: { ...config.media, local: { ...config.media.local!, allowedInProduction: true } },
      };
      expect(createMediaStorage(optedIn)).toBeInstanceOf(LocalMediaStorage);
    });
  });
});
