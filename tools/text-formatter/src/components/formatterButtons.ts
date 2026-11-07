export class FormatterButtons {
  static quiet(): string {
    return 'inline-flex min-h-control cursor-pointer items-center justify-center rounded-control border border-line bg-primary-soft px-3 text-ui font-semibold text-primary-deep transition-colors hover:bg-primary-soft-hover disabled:cursor-not-allowed disabled:opacity-55'
  }

  static primary(): string {
    return 'inline-flex min-h-control cursor-pointer items-center justify-center rounded-control border border-primary bg-primary px-4 text-label font-bold text-on-deep transition-colors enabled:hover:border-primary-deep enabled:hover:bg-primary-deep disabled:cursor-not-allowed disabled:opacity-55'
  }
}
