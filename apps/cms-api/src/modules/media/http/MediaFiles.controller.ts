import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

import { MediaLibraryService } from '../application/MediaLibrary.service';
import { PUBLIC_MEDIA_CACHE_CONTROL } from '../domain/Media.constants';
import { mediaNotFound } from '../domain/Media.entity';

const MEDIA_FILES_ROUTES = {
  ROOT: 'media-files',
  BY_NAME: ':fileName',
} as const;

/**
 * Public bytes of the local media storage (ADR 0021): no session or
 * permission guard, as public as a Cloudinary URL. The name is only ever a
 * `<uuidv7>.<ext>` the storage recognises; the content type comes from the
 * stored extension, never from the request.
 */
@Controller(MEDIA_FILES_ROUTES.ROOT)
export class MediaFilesController {
  constructor(private readonly library: MediaLibraryService) {}

  @Get(MEDIA_FILES_ROUTES.BY_NAME)
  async read(
    @Param('fileName') fileName: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.library.openPublicFile(fileName);
    if (file === null) throw mediaNotFound();
    // Set only on success: a 404 must never be cached for a year.
    res.set('Cache-Control', PUBLIC_MEDIA_CACHE_CONTROL);
    return new StreamableFile(file.stream, { type: file.mimeType, length: file.size });
  }
}
