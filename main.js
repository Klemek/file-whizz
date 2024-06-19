/* exported app */
let app = {
  data() {
    return {
      title: "Vue-Boilerplate",
      content:
        "Fill this page with <i>whatever</i> you're going to develop.<br><b>Then enjoy!</b>",
    };
  },
  computed: {
    currentYear() {
      return new Date().getFullYear();
    },
  },
  methods: {
    showApp() {
      document.getElementById("app").setAttribute("style", "");
    },
  },
  mounted: function () {
    console.log("app mounted");
    setTimeout(this.showApp);
  },
};

window.onload = () => {
  app = Vue.createApp(app);
  app.mount("#app");
};
