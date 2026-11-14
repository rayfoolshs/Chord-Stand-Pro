export interface Song {
  id: string;
  title: string;
  artist: string;
  key: string;
  capo: number;
  tempo: number;
  time: string;
  content: string;
  updatedAt: number;
}

export interface SetlistItem {
  songId: string;
  keyOverride: string;
  capoOverride: string | number;
  note: string;
}

export interface Setlist {
  id: string;
  name: string;
  items: SetlistItem[];
}

export interface MediaAttachment {
  songId: string;
  name: string;
  type: string;
  data: ArrayBuffer | Blob;
}

export interface ChartSegment {
  chord: string;
  text: string;
}

export type ChartItem =
  | { type: 'blank' }
  | { type: 'comment'; text: string }
  | { type: 'line'; segs: ChartSegment[] };

export interface ParsedSection {
  label: string;
  id: string;
  items: ChartItem[];
}

export interface ChartMeta {
  title: string;
  artist: string;
  key: string;
  capo: number;
  tempo: number;
  time: string;
}

export interface ParsedChart {
  meta: ChartMeta;
  sections: ParsedSection[];
}

export interface StageSyncPayload {
  type: 'stage-state';
  song: Omit<Song, 'updatedAt'>;
  transpose: number;
  capo: number;
  scrollRatio: number;
  sectionId: string | null;
}

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
}
