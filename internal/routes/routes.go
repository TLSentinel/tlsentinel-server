package routes

import (
	"io/fs"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	httpSwagger "github.com/swaggo/http-swagger"

	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/certificates"
	"github.com/tlsentinel/tlsentinel-server/internal/crypto"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/handlers"
	"github.com/tlsentinel/tlsentinel-server/internal/hosts"
	"github.com/tlsentinel/tlsentinel-server/internal/logger"
	"github.com/tlsentinel/tlsentinel-server/internal/mail"
	"github.com/tlsentinel/tlsentinel-server/internal/probe"
	"github.com/tlsentinel/tlsentinel-server/internal/scanners"
	"github.com/tlsentinel/tlsentinel-server/internal/settings"
	"github.com/tlsentinel/tlsentinel-server/internal/users"
	"github.com/tlsentinel/tlsentinel-server/internal/utils"
	tlsetinelWeb "github.com/tlsentinel/tlsentinel-server/web"
)

func RegisterRoutes(store *db.Store, jwtCfg *auth.JWTConfig, enc *crypto.Encryptor) http.Handler {
	r := chi.NewRouter()

	tokenHandler := scanners.NewHandler(store)
	certHandler := certificates.NewHandler(store)
	settingsHandler := settings.NewHandler(store)
	hostHandler := hosts.NewHandler(store)
	authHandler := auth.NewHandler(store, jwtCfg)
	userHandler := users.NewHandler(store)
	utilsHandler := utils.NewHandler()
	scannerHandler := probe.NewHandler(store)
	mailHandler := mail.NewHandler(store, enc)

	r.Use(middleware.RequestID)
	r.Use(logger.RequestLogger)
	r.Use(middleware.Recoverer)

	r.Get("/api-docs/*", httpSwagger.WrapHandler)

	r.Route("/api/v1", func(r chi.Router) {

		// Public routes
		r.Get("/health", handlers.Health)
		r.Get("/version", handlers.Version)
		r.Post("/auth/login", authHandler.Login)

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(auth.Authenticate(store, jwtCfg))

			r.Route("/scanners", func(r chi.Router) {
				r.Get("/", tokenHandler.List)
				r.Post("/", tokenHandler.Create)
				r.Route("/{scannerID}", func(r chi.Router) {
					r.Put("/", tokenHandler.Update)
					r.Delete("/", tokenHandler.Delete)
					r.Post("/default", tokenHandler.SetDefault)
				})
			})
			r.Route("/alerts", func(r chi.Router) {
				// TODO IGNORE FOR NOW
			})

			r.Route("/certificates", func(r chi.Router) {
				r.Get("/", certHandler.List)
				r.Post("/", certHandler.Create)
				r.Get("/active", certHandler.Active)
				r.Get("/expiring", certHandler.Expiring)
				r.Route("/{fingerprint}", func(r chi.Router) {
					r.Get("/", certHandler.Get)
					r.Delete("/", certHandler.Delete)
					r.Get("/hosts", certHandler.GetHosts)
				})
			})

			r.Route("/hosts", func(r chi.Router) {
				r.Get("/", hostHandler.List)
				r.Post("/", hostHandler.Create)
				r.Route("/{hostID}", func(r chi.Router) {
					r.Get("/", hostHandler.Get)
					r.Put("/", hostHandler.Update)
					r.Delete("/", hostHandler.Delete)
					r.Get("/tls-profile", hostHandler.GetTLSProfile)
					r.Get("/history", hostHandler.History)
				})
			})

			r.Route("/users", func(r chi.Router) {
				r.Get("/", userHandler.List)
				r.Post("/", userHandler.Create)
				r.Route("/{userID}", func(r chi.Router) {
					r.Get("/", userHandler.Get)
					r.Put("/", userHandler.Update)
					r.Delete("/", userHandler.Delete)
					r.Patch("/password", userHandler.ChangePassword)
				})
			})

			r.Route("/settings", func(r chi.Router) {
				r.Route("/mail", func(r chi.Router) {
					r.Get("/", mailHandler.Get)
					r.Put("/", mailHandler.Save)
					r.Post("/test", mailHandler.Test)
				})
				r.Get("/alert-thresholds", settingsHandler.GetAlertThresholds)
				r.Put("/alert-thresholds", settingsHandler.SetAlertThresholds)
			})

			r.Route("/utils", func(r chi.Router) {
				r.Get("/resolve", utilsHandler.Resolve)
			})

			r.Route("/probe", func(r chi.Router) {
				r.Use(probe.RequireScanner)
				r.Get("/config", scannerHandler.Config)
				r.Get("/hosts", scannerHandler.Hosts)
				r.Post("/hosts/{hostID}/result", scannerHandler.Result)
				r.Post("/hosts/{hostID}/tls-profile", scannerHandler.TLSProfile)
			})
		})

	})

	// Serve embedded frontend with SPA fallback — any path that isn't a real
	// static asset gets index.html so React Router handles it client-side.
	distFS, _ := fs.Sub(tlsetinelWeb.FS, "dist")
	fileServer := http.FileServer(http.FS(distFS))
	r.Handle("/*", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f, err := distFS.Open(r.URL.Path[1:]) // strip leading /
		if err != nil {
			// Not a real file — serve index.html and let React Router handle it.
			r.URL.Path = "/"
		} else {
			f.Close()
		}
		fileServer.ServeHTTP(w, r)
	}))

	return r
}
