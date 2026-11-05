import { SiteHome } from './siteHome'

export function HomeOrb() {
  return (
    <a className="home-orb" href={SiteHome.href(window.location.pathname)} aria-label={SiteHome.label}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
        <path fill="currentColor" d="M12 3.2 2.8 11h2.1V21h5.4v-6.2h3.4V21h5.4v-10h2.1L12 3.2Z" />
      </svg>
    </a>
  )
}
