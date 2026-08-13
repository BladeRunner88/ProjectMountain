// Tab ids used by the ASE dataset and Trust engine. Kept here so the engine
// layer does not import Control Room UI. Values match the eleven Control Room
// tabs (S1d).

export type TabId =
  | 'overview'
  | 'processing'
  | 'model'
  | 'identity'
  | 'meaning'
  | 'reasoning'
  | 'detection'
  | 'prediction'
  | 'revision'
  | 'exposure'
  | 'trust'

const TAB_IDS: readonly TabId[] = [
  'overview',
  'processing',
  'model',
  'identity',
  'meaning',
  'reasoning',
  'detection',
  'prediction',
  'revision',
  'exposure',
  'trust',
]

export function isTabId(value: string): value is TabId {
  return (TAB_IDS as readonly string[]).includes(value)
}
