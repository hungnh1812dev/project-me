import {
  mediaRefInvalidMessage,
  MEDIA_REF_ERROR_CODES,
} from './Media.constants';

describe('media reference errors', () => {
  it('keeps the wire code byte for byte', () => {
    expect(MEDIA_REF_ERROR_CODES.INVALID).toBe('DOCUMENT_INVALID');
  });

  it('words the message by input path only, never by the cause', () => {
    expect(mediaRefInvalidMessage('values.cover')).toBe(
      'values.cover refers to a file that does not exist',
    );
  });
});
