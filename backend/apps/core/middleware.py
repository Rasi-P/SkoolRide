import uuid


class RequestIdMiddleware:
    """Attach a request id to every request/response so logs and audit entries can be correlated."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = request.META.get("HTTP_X_REQUEST_ID") or uuid.uuid4().hex[:16]
        response = self.get_response(request)
        response["X-Request-Id"] = request.request_id
        if request.path.startswith(("/api/", "/media/")):
            response["Cache-Control"] = "no-store, private"
            response["Pragma"] = "no-cache"
        return response
