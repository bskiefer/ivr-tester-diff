export interface StreamDetails {
  sid: string;
  call: { from: string; to: string };
}

/**
 * Returns the filename used for recording a stream. The filename returned does not
 * need to contain the path nor extension.
 */
export type FilenameFactory = (
  stream: StreamDetails,
  customSuffix?: string
) => string;
