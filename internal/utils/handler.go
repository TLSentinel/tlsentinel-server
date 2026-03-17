package utils

import (
	"net"
	"net/http"

	"github.com/tlsentinel/tlsentinel-server/pkg/response"
)

type Handler struct{}

func NewHandler() *Handler {
	return &Handler{}
}

// DNSResolveResult is the response for a DNS resolution request.
type DNSResolveResult struct {
	Hostname  string   `json:"hostname"`
	Addresses []string `json:"addresses"`
}

// @Summary      Resolve DNS
// @Description  Resolves a hostname to its IP addresses
// @Tags         utils
// @Produce      json
// @Param        hostname  query     string  true  "Hostname to resolve"
// @Success      200       {object}  DNSResolveResult
// @Failure      400       {string}  string  "hostname is required"
// @Failure      502       {string}  string  "failed to resolve hostname"
// @Router       /utils/resolve [get]
func (h *Handler) Resolve(w http.ResponseWriter, r *http.Request) {
	hostname := r.URL.Query().Get("hostname")
	if hostname == "" {
		http.Error(w, "hostname is required", http.StatusBadRequest)
		return
	}

	addrs, err := net.LookupHost(hostname)
	if err != nil {
		http.Error(w, "failed to resolve hostname", http.StatusBadGateway)
		return
	}

	response.JSON(w, http.StatusOK, DNSResolveResult{
		Hostname:  hostname,
		Addresses: addrs,
	})
}
