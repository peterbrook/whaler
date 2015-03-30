var BASE_URL = "https://dev-dot-whaler-on-fleek.appspot.com"

interstitial_url = null
commit_message = null
session_token = null
current_redirect_url = null

/**
 * Our CSS makes the merge buttons blue.
 */
function injectCSS() {
  var link = document.createElement('link');
  link.href = chrome.extension.getURL('css/whaler.css');
  link.rel = 'stylesheet';
  head = document.getElementsByTagName ('head')[0] || document.documentElement;
  head.insertBefore(link, head.lastChild);
}

/**
 * Make our changes to the HTML.
 */
function updateDocument() {
  if (!/\/pull\//.test(document.URL)) {
    // This is not a pull request URL.
    return;
  }

  var mergeButton = document.querySelector('.merge-branch-action');
  if (mergeButton != null) {
    // Add our CSS tag to paint the button blue.
    mergeButton.className = mergeButton.className.replace(/primary/g, 'whaler');
    // Modify the text
    mergeButton.innerHTML = mergeButton.innerHTML.replace(/Merge pull request/g, 'Squash merge')

    mergeButton.addEventListener("click", goToInterstitial)
  }

  var form = document.querySelector('.merge-branch-form');
  if (form == null) return;

  // Redirect the form to our server so that we can handle the merge.
  form.action = BASE_URL + '/merge';

  auth_token_field = form.querySelector('input[name="authenticity_token"]');
  if (auth_token_field != null) {
    // Add a session token field.
    session_field = form.querySelector('input[name="session_token"]');
    if (!session_field) {
      session_field = auth_token_field.cloneNode(true);
      auth_token_field.parentNode.appendChild(session_field);
    }
    session_field.name = 'session_token'
    session_field.value = session_token

    // Add a username field.
    username_field = form.querySelector('input[name="username"]');
    if (!username_field) {
      username_field = auth_token_field.cloneNode(true);
      auth_token_field.parentNode.appendChild(username_field);
    }
    username_field.name = 'username'
    username_field.value = getUsername()
  }

  confirmMergeButton = form.querySelector('.btn');
  // Add our CSS tag to paint the button blue.
  confirmMergeButton.className = confirmMergeButton.className.replace(/primary/g, 'whaler');

  // Change the default text in the commit-message field.
  var merge_message_field = form.querySelector('.merge-commit-message')
  if (merge_message_field != null && commit_message != null) {
    merge_message_field.innerHTML = commit_message
    // Make the text box taller.
    var style = "margin-top: 10px; margin-bottom: 10px; height: 200px;"
    merge_message_field.setAttribute("style", style)
  }
}

function getUsername() {
  name_header = document.querySelector('a.header-nav-link.name')
  return name_header.href.replace(/https:\/\/github.com\// ,'')
}

/**
 * Requests an interstitial URL from the server.
 * This is a URL that we will redirect to upon clicking the "Squash merge" button.
 * This may be used to prompt for GitHub application access, to upgrade the chrome extension, etc.
 */
function fetchInterstitial() {
  current_redirect_url = document.URL
  url = BASE_URL + '/premerge?username=' + getUsername() +
        '&redirect=' + current_redirect_url +
        '&session_token=' + session_token
  $.get(url, function(responseText) {
    var response = JSON.parse(responseText)
    interstitial_url = response['interstitial_url']
    commit_message = response['commit_message']
    updateDocument()
  });
}

function goToInterstitial() {
  if (interstitial_url) {
    window.location.href = interstitial_url
  }
}

function pageChangedCallback() {
    // We must remove the event listener before updateDocument() to prevent recursion.
    document.removeEventListener('DOMNodeInserted', pageChangedCallback);
    updateDocument();
    document.addEventListener('DOMNodeInserted', pageChangedCallback);

    // This is an ugly hack. If we have a pending interstitial and the doc url has changed,
    // the redirect may be old unless we get a new interstitial URL...
    if (interstitial_url != null && current_redirect_url != document.URL) {
      fetchInterstitial();
    }
}

/**
 * We authenticate that we are the same user that granted the GitHub Oauth permission by presenting a randomly-generated token.
 * This is stored locally as a cookie. When it is lost; we must present a new oauth token to the server.
 * We cannot access cookies from the content context, so we post this message, and the background script returns a token.
 */
chrome.runtime.sendMessage({message: "get_session_token"}, function(response) {
  session_token = response.session_token;
  fetchInterstitial();
  updateDocument();
});

injectCSS();
updateDocument();

// GitHub dynamically modifies the merge form. We need to make sure we apply our modifications when it is updated.
// TODO: This is allegedly terrible for performance. What's a better way of doing this?
document.addEventListener('DOMNodeInserted', pageChangedCallback);

// Call page change callback when the document URL changes.
var storedURL = document.URL;
window.setInterval(function() {
    if (document.URL != storedURL) {
        storedURL = document.URL;
        pageChangedCallback();
    }
}, 100);