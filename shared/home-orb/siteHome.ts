export class SiteHome {
  static label = '返回工具集首页'

  static href(pathname: string): string {
    const matched = pathname.match(/^(.*)\/tools\/[^/]+(?:\/|$)/)
    if (!matched || matched[1] === '') return '/'
    return `${matched[1]}/`
  }
}
