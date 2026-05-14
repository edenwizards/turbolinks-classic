// Converted from turbolinks.js.coffee via decaffeinate. The original
// CoffeeScript was wrapped in an implicit per-file IIFE, which made the
// closing `@Turbolinks = {...}` line bind to the IIFE's `this`. To
// preserve identical Sprockets bundle semantics (no name leakage into
// the surrounding bundle; correct `window.Turbolinks` assignment), the
// whole file is re-wrapped here.
(function() {
let needle, visit;
const pageCache               = {};
let cacheSize               = 10;
let transitionCacheEnabled  = false;
let progressBar             = null;

let currentState            = null;
let loadedAssets            = null;

let referer                 = null;

let xhr                     = null;

const EVENTS = {
  BEFORE_CHANGE:  'page:before-change',
  FETCH:          'page:fetch',
  RECEIVE:        'page:receive',
  CHANGE:         'page:change',
  UPDATE:         'page:update',
  LOAD:           'page:load',
  RESTORE:        'page:restore',
  BEFORE_UNLOAD:  'page:before-unload',
  EXPIRE:         'page:expire'
};

const fetch = function(url) {
  let cachedPage;
  url = new ComponentUrl(url);

  rememberReferer();
  cacheCurrentPage();
  progressBar?.start();

  if (transitionCacheEnabled && (cachedPage = transitionCacheFor(url.absolute))) {
    fetchHistory(cachedPage);
    return fetchReplacement(url, null, false);
  } else {
    return fetchReplacement(url, resetScrollPosition);
  }
};

var transitionCacheFor = function(url) {
  const cachedPage = pageCache[url];
  if (cachedPage && !cachedPage.transitionCacheDisabled) { return cachedPage; }
};

const enableTransitionCache = function(enable) {
  if (enable == null) { enable = true; }
  return transitionCacheEnabled = enable;
};

const enableProgressBar = function(enable) {
  if (enable == null) { enable = true; }
  if (!browserSupportsTurbolinks) { return; }
  if (enable) {
    return progressBar != null ? progressBar : (progressBar = new ProgressBar('html'));
  } else {
    progressBar?.uninstall();
    return progressBar = null;
  }
};

var fetchReplacement = function(url, onLoadFunction, showProgressBar) {
  if (showProgressBar == null) { showProgressBar = true; }
  triggerEvent(EVENTS.FETCH, {url: url.absolute});

  xhr?.abort();
  xhr = new XMLHttpRequest;
  xhr.open('GET', url.withoutHashForIE10compatibility(), true);
  xhr.setRequestHeader('Accept', 'text/html, application/xhtml+xml, application/xml');
  xhr.setRequestHeader('X-XHR-Referer', referer);

  xhr.onload = function() {
    let doc;
    triggerEvent(EVENTS.RECEIVE, {url: url.absolute});

    if (doc = processResponse()) {
      reflectNewUrl(url);
      reflectRedirectedUrl();
      changePage(...Array.from(extractTitleAndBody(doc) || []));
      manuallyTriggerHashChangeForFirefox();
      onLoadFunction?.();
      return triggerEvent(EVENTS.LOAD);
    } else {
      return document.location.href = crossOriginRedirect() || url.absolute;
    }
  };

  if (progressBar && showProgressBar) {
    xhr.onprogress = event => {
      const percent = event.lengthComputable ?
        (event.loaded / event.total) * 100
      :
        progressBar.value + ((100 - progressBar.value) / 10);
      return progressBar.advanceTo(percent);
    };
  }

  xhr.onloadend = () => xhr = null;
  xhr.onerror   = () => document.location.href = url.absolute;

  return xhr.send();
};

var fetchHistory = function(cachedPage) {
  xhr?.abort();
  changePage(cachedPage.title, cachedPage.body);
  recallScrollPosition(cachedPage);
  return triggerEvent(EVENTS.RESTORE);
};


var cacheCurrentPage = function() {
  const currentStateUrl = new ComponentUrl(currentState.url);

  pageCache[currentStateUrl.absolute] = {
    url:                      currentStateUrl.relative,
    body:                     document.body,
    title:                    document.title,
    positionY:                window.pageYOffset,
    positionX:                window.pageXOffset,
    cachedAt:                 new Date().getTime(),
    transitionCacheDisabled:  (document.querySelector('[data-no-transition-cache]') != null)
  };

  return constrainPageCacheTo(cacheSize);
};

const pagesCached = function(size) {
  if (size == null) { size = cacheSize; }
  if (/^[\d]+$/.test(size)) { return cacheSize = parseInt(size); }
};

var constrainPageCacheTo = function(limit) {
  const pageCacheKeys = Object.keys(pageCache);

  const cacheTimesRecentFirst = pageCacheKeys.map(url => pageCache[url].cachedAt).sort((a, b) => b - a);

  return (() => {
    const result = [];
    for (var key of Array.from(pageCacheKeys)) {
      if (pageCache[key].cachedAt <= cacheTimesRecentFirst[limit]) {
        triggerEvent(EVENTS.EXPIRE, pageCache[key]);
        result.push(delete pageCache[key]);
      }
    }
    return result;
  })();
};

var changePage = function(title, body, csrfToken, runScripts) {
  triggerEvent(EVENTS.BEFORE_UNLOAD);
  document.title = title;
  document.documentElement.replaceChild(body, document.body);
  if (csrfToken != null) { CSRFToken.update(csrfToken); }
  setAutofocusElement();
  if (runScripts) { executeScriptTags(); }
  currentState = window.history.state;
  progressBar?.done();
  triggerEvent(EVENTS.CHANGE);
  return triggerEvent(EVENTS.UPDATE);
};

var executeScriptTags = function() {
  const scripts = Array.prototype.slice.call(document.body.querySelectorAll('script:not([data-turbolinks-eval="false"])'));
  for (var script of Array.from(scripts)) {
    if (['', 'text/javascript'].includes(script.type)) {
      var copy = document.createElement('script');
      for (var attr of Array.from(script.attributes)) { copy.setAttribute(attr.name, attr.value); }
      if (!script.hasAttribute('async')) { copy.async = false; }
      copy.appendChild(document.createTextNode(script.innerHTML));
      var { parentNode, nextSibling } = script;
      parentNode.removeChild(script);
      parentNode.insertBefore(copy, nextSibling);
    }
  }
};

const removeNoscriptTags = function(node) {
  node.innerHTML = node.innerHTML.replace(/<noscript[\S\s]*?<\/noscript>/ig, '');
  return node;
};

// Firefox bug: Doesn't autofocus fields that are inserted via JavaScript
var setAutofocusElement = function() {
  let list;
  const autofocusElement = (list = document.querySelectorAll('input[autofocus], textarea[autofocus]'))[list.length - 1];
  if (autofocusElement && (document.activeElement !== autofocusElement)) {
    return autofocusElement.focus();
  }
};

var reflectNewUrl = function(url) {
  if ((url = new ComponentUrl(url)).absolute !== referer) {
    return window.history.pushState({ turbolinks: true, url: url.absolute }, '', url.absolute);
  }
};

var reflectRedirectedUrl = function() {
  let location;
  if (location = xhr.getResponseHeader('X-XHR-Redirected-To')) {
    location = new ComponentUrl(location);
    const preservedHash = location.hasNoHash() ? document.location.hash : '';
    return window.history.replaceState(window.history.state, '', location.href + preservedHash);
  }
};

var crossOriginRedirect = function() {
  let redirect;
  if (((redirect = xhr.getResponseHeader('Location')) != null) && (new ComponentUrl(redirect)).crossOrigin()) { return redirect; }
};

var rememberReferer = () => referer = document.location.href;

const rememberCurrentUrl = () => window.history.replaceState({ turbolinks: true, url: document.location.href }, '', document.location.href);

const rememberCurrentState = () => currentState = window.history.state;

// Unlike other browsers, Firefox doesn't trigger hashchange after changing the
// location (via pushState) to an anchor on a different page.  For example:
//
//   /pages/one  =>  /pages/two#with-hash
//
// By forcing Firefox to trigger hashchange, the rest of the code can rely on more
// consistent behavior across browsers.
var manuallyTriggerHashChangeForFirefox = function() {
  let url;
  if (navigator.userAgent.match(/Firefox/) && !(url = (new ComponentUrl)).hasNoHash()) {
    window.history.replaceState(currentState, '', url.withoutHash());
    return document.location.hash = url.hash;
  }
};

var recallScrollPosition = page => window.scrollTo(page.positionX, page.positionY);

var resetScrollPosition = function() {
  if (document.location.hash) {
    return document.location.href = document.location.href;
  } else {
    return window.scrollTo(0, 0);
  }
};


var clone = function(original) {
  if ((original == null) || (typeof original !== 'object')) { return original; }
  const copy = new original.constructor();
  for (var key in original) { var value = original[key]; copy[key] = clone(value); }
  return copy;
};

const popCookie = function(name) {
  const value = document.cookie.match(new RegExp(name+"=(\\w+)"))?.[1].toUpperCase() || '';
  document.cookie = name + '=; expires=Thu, 01-Jan-70 00:00:01 GMT; path=/';
  return value;
};

var triggerEvent = function(name, data) {
  if (typeof Prototype !== 'undefined') {
    Event.fire(document, name, data, true);
  }

  const event = document.createEvent('Events');
  if (data) { event.data = data; }
  event.initEvent(name, true, true);
  return document.dispatchEvent(event);
};

const pageChangePrevented = url => !triggerEvent(EVENTS.BEFORE_CHANGE, {url});

var processResponse = function() {
  const clientOrServerError = () => 400 <= xhr.status && xhr.status < 600;

  const validContent = function() {
    let contentType;
    return ((contentType = xhr.getResponseHeader('Content-Type')) != null) &&
      contentType.match(/^(?:text\/html|application\/xhtml\+xml|application\/xml)(?:;|$)/);
  };

  const extractTrackAssets = doc => (() => {
    const result = [];
    for (var node of Array.from(doc.querySelector('head').childNodes)) {
      if (node.getAttribute?.('data-turbolinks-track') != null) {
        result.push(node.getAttribute('src') || node.getAttribute('href'));
      }
    }
    return result;
  })();

  const assetsChanged = function(doc) {
    if (!loadedAssets) { loadedAssets = extractTrackAssets(document); }
    const fetchedAssets  = extractTrackAssets(doc);
    return (fetchedAssets.length !== loadedAssets.length) || (intersection(fetchedAssets, loadedAssets).length !== loadedAssets.length);
  };

  var intersection = function(a, b) {
    if (a.length > b.length) { [a, b] = Array.from([b, a]); }
    return Array.from(a).filter((value) => Array.from(b).includes(value));
  };

  if (!clientOrServerError() && validContent()) {
    const doc = createDocument(xhr.responseText);
    if (doc && !assetsChanged(doc)) {
      return doc;
    }
  }
};

var extractTitleAndBody = function(doc) {
  const title = doc.querySelector('title');
  return [ title?.textContent, removeNoscriptTags(doc.querySelector('body')), CSRFToken.get(doc).token, 'runScripts' ];
};

var CSRFToken = {
  get(doc) {
    let tag;
    if (doc == null) { doc = document; }
    return {
      node:   (tag = doc.querySelector('meta[name="csrf-token"]')),
      token:  tag?.getAttribute?.('content')
    };
  },

  update(latest) {
    const current = this.get();
    if ((current.token != null) && (latest != null) && (current.token !== latest)) {
      return current.node.setAttribute('content', latest);
    }
  }
};

var createDocument = function(html) {
  const doc = document.documentElement.cloneNode();
  doc.innerHTML = html;
  doc.head = doc.querySelector('head');
  doc.body = doc.querySelector('body');
  return doc;
};

// The ComponentUrl class converts a basic URL string into an object
// that behaves similarly to document.location.
//
// If an instance is created from a relative URL, the current document
// is used to fill in the missing attributes (protocol, host, port).
class ComponentUrl {
  constructor(original) {
    if (original == null) { original = document.location.href; }
    this.original = original;
    if (this.original.constructor === ComponentUrl) { return this.original; }
    this._parse();
  }

  withoutHash() { return this.href.replace(this.hash, '').replace('#', ''); }

  // Intention revealing function alias
  withoutHashForIE10compatibility() { return this.withoutHash(); }

  hasNoHash() { return this.hash.length === 0; }

  crossOrigin() {
    return this.origin !== (new ComponentUrl).origin;
  }

  _parse() {
    (this.link != null ? this.link : (this.link = document.createElement('a'))).href = this.original;
    ({ href: this.href, protocol: this.protocol, host: this.host, hostname: this.hostname, port: this.port, pathname: this.pathname, search: this.search, hash: this.hash } = this.link);
    this.origin = [this.protocol, '//', this.hostname].join('');
    if (this.port.length !== 0) { this.origin += `:${this.port}`; }
    this.relative = [this.pathname, this.search, this.hash].join('');
    return this.absolute = this.href;
  }
}

// The Link class derives from the ComponentUrl class, but is built from an
// existing link element.  Provides verification functionality for Turbolinks
// to use in determining whether it should process the link when clicked.
class Link extends ComponentUrl {
  static initClass() {
    this.HTML_EXTENSIONS = ['html'];
  }

  static allowExtensions(...extensions) {
    for (var extension of Array.from(extensions)) { Link.HTML_EXTENSIONS.push(extension); }
    return Link.HTML_EXTENSIONS;
  }

  constructor(link) {
    this.link = link;
    if (this.link.constructor === Link) { return this.link; }
    this.original = this.link.href;
    this.originalElement = this.link;
    this.link = this.link.cloneNode(false);
    super(...arguments);
  }

  shouldIgnore() {
    return this.crossOrigin() ||
      this._anchored() ||
      this._nonHtml() ||
      this._optOut() ||
      this._target();
  }

  _anchored() {
    return ((this.hash.length > 0) || (this.href.charAt(this.href.length - 1) === '#')) &&
      (this.withoutHash() === (new ComponentUrl).withoutHash());
  }

  _nonHtml() {
    return this.pathname.match(/\.[a-z]+$/g) && !this.pathname.match(new RegExp(`\\.(?:${Link.HTML_EXTENSIONS.join('|')})?$`, 'g'));
  }

  _optOut() {
    let ignore;
    let link = this.originalElement;
    while (!ignore && (link !== document)) {
      ignore = (link.getAttribute('data-no-turbolink') != null);
      link = link.parentNode;
    }
    return ignore;
  }

  _target() {
    return this.link.target.length !== 0;
  }
}
Link.initClass();


// The Click class handles clicked links, verifying if Turbolinks should
// take control by inspecting both the event and the link. If it should,
// the page change process is initiated. If not, control is passed back
// to the browser for default functionality.
class Click {
  static installHandlerLast(event) {
    if (!event.defaultPrevented) {
      document.removeEventListener('click', Click.handle, false);
      return document.addEventListener('click', Click.handle, false);
    }
  }

  static handle(event) {
    return new Click(event);
  }

  constructor(event) {
    this.event = event;
    if (this.event.defaultPrevented) { return; }
    this._extractLink();
    if (this._validForTurbolinks()) {
      if (!pageChangePrevented(this.link.absolute)) { visit(this.link.href); }
      this.event.preventDefault();
    }
  }

  _extractLink() {
    let link = this.event.target;
    while (!!link.parentNode && (link.nodeName !== 'A')) { link = link.parentNode; }
    if ((link.nodeName === 'A') && (link.href.length !== 0)) { return this.link = new Link(link); }
  }

  _validForTurbolinks() {
    return (this.link != null) && !(this.link.shouldIgnore() || this._nonStandardClick());
  }

  _nonStandardClick() {
    return (this.event.which > 1) ||
      this.event.metaKey ||
      this.event.ctrlKey ||
      this.event.shiftKey ||
      this.event.altKey;
  }
}


var ProgressBar = (function() {
  let className = undefined;
  ProgressBar = class ProgressBar {
    static initClass() {
      className = 'turbolinks-progress-bar';
    }

    constructor(elementSelector) {
      this._trickle = this._trickle.bind(this);
      this.elementSelector = elementSelector;
      this.value = 0;
      this.content = '';
      this.speed = 300;
      // Setting the opacity to a value < 1 fixes a display issue in Safari 6 and
      // iOS 6 where the progress bar would fill the entire page.
      this.opacity = 0.99;
      this.install();
    }

    install() {
      this.element = document.querySelector(this.elementSelector);
      this.element.classList.add(className);
      this.styleElement = document.createElement('style');
      document.head.appendChild(this.styleElement);
      return this._updateStyle();
    }

    uninstall() {
      this.element.classList.remove(className);
      return document.head.removeChild(this.styleElement);
    }

    start() {
      return this.advanceTo(5);
    }

    advanceTo(value) {
      if (value > this.value && this.value <= 100) {
        this.value = value;
        this._updateStyle();

        if (this.value === 100) {
          return this._stopTrickle();
        } else if (this.value > 0) {
          return this._startTrickle();
        }
      }
    }

    done() {
      if (this.value > 0) {
        this.advanceTo(100);
        return this._reset();
      }
    }

    _reset() {
      const originalOpacity = this.opacity;

      setTimeout(() => {
        this.opacity = 0;
        return this._updateStyle();
      }
      , this.speed / 2);

      return setTimeout(() => {
        this.value = 0;
        this.opacity = originalOpacity;
        return this._withSpeed(0, () => this._updateStyle(true));
      }
      , this.speed);
    }

    _startTrickle() {
      if (this.trickling) { return; }
      this.trickling = true;
      return setTimeout(this._trickle, this.speed);
    }

    _stopTrickle() {
      return delete this.trickling;
    }

    _trickle() {
      if (!this.trickling) { return; }
      this.advanceTo(this.value + (Math.random() / 2));
      return setTimeout(this._trickle, this.speed);
    }

    _withSpeed(speed, fn) {
      const originalSpeed = this.speed;
      this.speed = speed;
      const result = fn();
      this.speed = originalSpeed;
      return result;
    }

    _updateStyle(forceRepaint) {
      if (forceRepaint == null) { forceRepaint = false; }
      if (forceRepaint) { this._changeContentToForceRepaint(); }
      return this.styleElement.textContent = this._createCSSRule();
    }

    _changeContentToForceRepaint() {
      return this.content = this.content === '' ? ' ' : '';
    }

    _createCSSRule() {
      return `\
${this.elementSelector}.${className}::before {
  content: '${this.content}';
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2000;
  background-color: #0076ff;
  height: 3px;
  opacity: ${this.opacity};
  width: ${this.value}%;
  transition: width ${this.speed}ms ease-out, opacity ${this.speed / 2}ms ease-in;
  transform: translate3d(0,0,0);
}\
`;
    }
  };
  ProgressBar.initClass();
  return ProgressBar;
})();


// Delay execution of function long enough to miss the popstate event
// some browsers fire on the initial page load.
const bypassOnLoadPopstate = fn => setTimeout(fn, 500);

const installDocumentReadyPageEventTriggers = () => document.addEventListener('DOMContentLoaded', ( function() {
  triggerEvent(EVENTS.CHANGE);
  return triggerEvent(EVENTS.UPDATE);
}), true);

const installJqueryAjaxSuccessPageUpdateTrigger = function() {
  if (typeof jQuery !== 'undefined') {
    return jQuery(document).on('ajaxSuccess', function(event, xhr, settings) {
      if (!jQuery.trim(xhr.responseText)) { return; }
      return triggerEvent(EVENTS.UPDATE);
    });
  }
};

const installHistoryChangeHandler = function(event) {
  if (event.state?.turbolinks) {
    let cachedPage;
    if (cachedPage = pageCache[(new ComponentUrl(event.state.url)).absolute]) {
      cacheCurrentPage();
      return fetchHistory(cachedPage);
    } else {
      return visit(event.target.location.href);
    }
  }
};

const initializeTurbolinks = function() {
  rememberCurrentUrl();
  rememberCurrentState();

  document.addEventListener('click', Click.installHandlerLast, true);

  window.addEventListener('hashchange', function(event) {
    rememberCurrentUrl();
    return rememberCurrentState();
  }
  , false);
  return bypassOnLoadPopstate(() => window.addEventListener('popstate', installHistoryChangeHandler, false));
};

// Handle bug in Firefox 26/27 where history.state is initially undefined
const historyStateIsDefined =
  (window.history.state !== undefined) || navigator.userAgent.match(/Firefox\/2[6|7]/);

const browserSupportsPushState =
  window.history && window.history.pushState && window.history.replaceState && historyStateIsDefined;

const browserIsntBuggy =
  !navigator.userAgent.match(/CriOS\//);

const requestMethodIsSafe =
  (needle = popCookie('request_method'), ['GET',''].includes(needle));

var browserSupportsTurbolinks = browserSupportsPushState && browserIsntBuggy && requestMethodIsSafe;

const browserSupportsCustomEvents =
  document.addEventListener && document.createEvent;

if (browserSupportsCustomEvents) {
  installDocumentReadyPageEventTriggers();
  installJqueryAjaxSuccessPageUpdateTrigger();
}

if (browserSupportsTurbolinks) {
  visit = fetch;
  initializeTurbolinks();
} else {
  visit = url => document.location.href = url;
}

// Public API
//   Turbolinks.visit(url)
//   Turbolinks.pagesCached()
//   Turbolinks.pagesCached(20)
//   Turbolinks.enableTransitionCache()
//   Turbolinks.allowLinkExtensions('md')
//   Turbolinks.supported
//   Turbolinks.EVENTS
this.Turbolinks = {
  visit,
  pagesCached,
  enableTransitionCache,
  enableProgressBar,
  allowLinkExtensions: Link.allowExtensions,
  supported: browserSupportsTurbolinks,
  EVENTS: clone(EVENTS)
};

}).call(this);
