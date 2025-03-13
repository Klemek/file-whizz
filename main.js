import { createApp } from "vue";

const utils = {
  updateIcons() {
    lucide.createIcons({
      nameAttr: "icon",
      attrs: {
        width: "1.1em",
        height: "1.1em",
      },
    });
  },
};

const app = createApp({
  data() {
    return {
      content:
        "Fill this page with <i>whatever</i> you're going to develop.<br><b>Then enjoy!</b>",
    };
  },
  computed: {
    currentYear() {
      return new Date().getFullYear();
    },
  },
  watch: {},
  updated() {
    utils.updateIcons();
  },
  mounted() {
    setTimeout(this.showApp);
    utils.updateIcons();
  },
  methods: {
    showApp() {
      document.getElementById("app").setAttribute("style", "");
    },
  },
});

window.onload = () => {
  app.mount("#app");
};
