// CloudFront Function (cloudfront-js-2.0), viewer-request, default (S3) behaviour only.
// Client-side routes have no file extension; serve the app shell for them.
// Published by hand: see docs/cloud-architecture.md.
function handler(event) {
  var request = event.request
  var lastSegment = request.uri.substring(request.uri.lastIndexOf('/') + 1)
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html'
  }
  return request
}
