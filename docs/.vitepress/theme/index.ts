import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import './styles.css'
import supportButton from '../../../common/assets/images/buy-me-a-coffee-button.png'
import EspInstallButton from './components/EspInstallButton.vue'
import EspInstallSelector from './components/EspInstallSelector.vue'
import C6RecoveryCallout from './components/C6RecoveryCallout.vue'
import C6RecoverySelector from './components/C6RecoverySelector.vue'
import GitHubStars from './components/GitHubStars.vue'
import GuideBreadcrumbs from './components/GuideBreadcrumbs.vue'
import IconGallery from './components/IconGallery.vue'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => h(GitHubStars),
      'doc-before': () => h(GuideBreadcrumbs),
      'layout-bottom': () => h('a', {
        class: 'sp-support-btn',
        href: 'https://www.buymeacoffee.com/jtenniswood',
        target: '_blank',
        rel: 'noopener',
      }, h('img', { src: supportButton, alt: 'Buy me a coffee', width: 214, height: 60 })),
    })
  },
  enhanceApp({ app }) {
    app.component('EspInstallButton', EspInstallButton)
    app.component('EspInstallSelector', EspInstallSelector)
    app.component('C6RecoveryCallout', C6RecoveryCallout)
    app.component('C6RecoverySelector', C6RecoverySelector)
    app.component('GitHubStars', GitHubStars)
    app.component('IconGallery', IconGallery)
  },
}
