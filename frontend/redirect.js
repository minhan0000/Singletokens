if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth <= 768) {
  window.location.replace("/index-mobile.html");
}
