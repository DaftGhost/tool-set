export interface ClipboardPort {
  copy(value: string): Promise<void>
}

export class BrowserClipboard implements ClipboardPort {
  async copy(value: string): Promise<void> {
    const writer = globalThis.navigator?.clipboard?.writeText
    if (!writer) throw new Error('Clipboard access is unavailable')
    await globalThis.navigator.clipboard.writeText(value)
  }
}
