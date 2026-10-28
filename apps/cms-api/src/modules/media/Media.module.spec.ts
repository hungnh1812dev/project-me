import { devEnv } from '../../../test/fixtures/Env.fixture';
import { loadAppConfig } from '../../config/AppConfig.setup';
import { MEDIA_PROVIDERS } from '../../config/Config.constants';
import { FakeMediaStorage } from './adapters/Fake.adapter';
import { createMediaStorage, MEDIA_STORAGE_FACTORIES } from './Media.module';

describe('createMediaStorage', () => {
  it('uses the fake storage for MEDIA_PROVIDER=fake', () => {
    expect(createMediaStorage(loadAppConfig(devEnv()))).toBeInstanceOf(
      FakeMediaStorage,
    );
  });

  it('refuses the fake storage in production', () => {
    const config = { ...loadAppConfig(devEnv()), isProduction: true };
    expect(() => createMediaStorage(config)).toThrow(/production/);
  });

  it('has a factory for every MEDIA_PROVIDERS entry and no other', () => {
    expect(Object.keys(MEDIA_STORAGE_FACTORIES).sort()).toEqual(
      [...MEDIA_PROVIDERS].sort(),
    );
  });

  it('throws for a provider with no factory, including inherited names', () => {
    const config = loadAppConfig(devEnv());
    for (const provider of ['s3', 'constructor']) {
      const unknown = { ...config, media: { ...config.media, provider } };
      expect(() => createMediaStorage(unknown as never)).toThrow(
        /No media storage/,
      );
    }
  });
});
