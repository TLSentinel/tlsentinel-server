package handlers

import (
	"net/http"

	"github.com/tlsentinel/tlsentinel-server/internal/version"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"
)

// BuildInfo is the response shape for the version endpoint.
type BuildInfo struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildTime string `json:"buildTime"`
}

// @Summary      Application version
// @Description  Returns the version, git commit, and build timestamp of the running binary
// @Tags         system
// @Produce      json
// @Success      200  {object}  handlers.BuildInfo
// @Router       /version [get]
func Version(w http.ResponseWriter, r *http.Request) {
	response.JSON(w, http.StatusOK, BuildInfo{
		Version:   version.Version,
		Commit:    version.Commit,
		BuildTime: version.BuildTime,
	})
}
