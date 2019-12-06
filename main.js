/* exported app, utils */

const utils = {
  ajax: {
    proxy: 'cors-anywhere.herokuapp.com',
    /**
     * Define a get HTTP request to be executed with .then/.catch
     * @param {string} url
     * @param {Object} data
     * @param {boolean} proxy - use cors proxy
     * @returns {Promise<Object|string>} return JSON parsed data or string
     */
    get: (url, data, proxy = false) => {
      return new Promise((resolve, reject) => {
        if (data && Object.keys(data).length) {
          url += '?' + Object.keys(data)
            .map(k => k + '=' + encodeURIComponent(data[k]))
            .join('&')
            .replace(/%20/g, '+');
        }
        const xhr = new XMLHttpRequest();
        if (proxy) {
          const http = (window.location.protocol === 'http:' ? 'http:' : 'https:');
          url = `${http}//${utils.ajax.proxy}/${url}`;
        }
        xhr.open('GET', url);
        xhr.onload = () => {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (ignored) {
            resolve(xhr.responseText);
          }
        };
        xhr.onerror = () => reject(xhr);
        xhr.send();
      });
    },
  },
  cookies: {
    /**
     * Save a value in a cookie
     * @param {string} name
     * @param {string} value
     * @param {number | undefined} days
     */
    set: function (name, value, days = undefined) {
      const maxAge = !days ? undefined : days * 864e2;
      document.cookie = `${name}=${encodeURIComponent(value)}${maxAge ? `;max-age=${maxAge};` : ''}`;
    },
    /**
     * Get a value from a cookie
     * @param {string} name
     * @return {string} value from cookie or empty if not found
     */
    get: function (name) {
      return document.cookie.split('; ').reduce(function (r, v) {
        const parts = v.split('=');
        return parts[0] === name ? decodeURIComponent(parts[1]) : r;
      }, '');
    },
    /**
     * Delete a cookie
     * @param {string} name
     */
    delete: function (name) {
      this.set(name, '', -1);
    },
    /**
     * Clear all cookies
     */
    clear: function () {
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf('=');
        const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      }
    }
  }
};

let app = {
  el: '#app',
  data: {
    title:'Vue-Boilerplate',
    content: 'Fill this page with <i>whatever</i> you\'re going to develop.<br><b>Then enjoy!</b>'
  },
  methods: {

  },
  'mounted': () => {
    const self = this;
    console.log('app mounted');
    setTimeout(() => {
      self.$el.setAttribute('style', '');
    });
  }
};

window.onload = () => {
  app = new Vue(app);
};
