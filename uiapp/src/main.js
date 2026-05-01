import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/theme.css'

// Font Awesome
import { library } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faFileVideo } from '@fortawesome/free-regular-svg-icons'
import { faPlay, faDownload, faTrashCan, faArrowRotateRight } from '@fortawesome/free-solid-svg-icons'

const app = createApp(App)

app.use(router)

// register component
app.component('FontAwesomeIcon', FontAwesomeIcon)

// add icons to the library
library.add(faFileVideo, faPlay, faDownload, faTrashCan, faArrowRotateRight)

app.mount('#app')