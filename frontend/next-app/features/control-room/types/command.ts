export type CommandKind = 'entity' | 'tab' | 'rule' | 'source'

export interface CommandItem {
  id: string
  kind: CommandKind
  label: string
  sublabel?: string
  onSelect: () => void
}
