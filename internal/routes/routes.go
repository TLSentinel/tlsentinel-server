package routes

import (
	"context"
	"io/fs"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	httpSwagger "github.com/swaggo/http-swagger"

	"github.com/tlsentinel/tlsentinel-server/internal/audit"
	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/calendar"
	"github.com/tlsentinel/tlsentinel-server/internal/certificates"
	"github.com/tlsentinel/tlsentinel-server/internal/config"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/endpoints"
	"github.com/tlsentinel/tlsentinel-server/internal/groups"
	"github.com/tlsentinel/tlsentinel-server/internal/handlers"
	"github.com/tlsentinel/tlsentinel-server/internal/logger"
	"github.com/tlsentinel/tlsentinel-server/internal/mail"
	"github.com/tlsentinel/tlsentinel-server/internal/oidc"
	"github.com/tlsentinel/tlsentinel-server/internal/permission"
	"github.com/tlsentinel/tlsentinel-server/internal/probe"
	"github.com/tlsentinel/tlsentinel-server/internal/scanners"
	"github.com/tlsentinel/tlsentinel-server/internal/settings"
	"github.com/tlsentinel/tlsentinel-server/internal/tags"
	"github.com/tlsentinel/tlsentinel-server/internal/users"
	"github.com/tlsentinel/tlsentinel-server/internal/utils"
	tlsetinelWeb "github.com/tlsentinel/tlsentinel-server/web"
)

func RegisterRoutes(store *db.Store, cfg *config.Config) (http.Handler, error) {

	authHandler := auth.NewHandler(store, cfg)
	oidcHandler, err := oidc.NewHandler(context.Background(), store, cfg)
	if err != nil {
		return nil, err
	}
	tokenHandler := scanners.NewHandler(store)
	scannerHandler := probe.NewHandler(store)
	userHandler := users.NewHandler(store)
	settingsHandler := settings.NewHandler(store)
	certHandler := certificates.NewHandler(store)
	endpointHandler := endpoints.NewHandler(store)
	utilsHandler := utils.NewHandler()
	mailHandler := mail.NewHandler(store, cfg)
	calendarHandler := calendar.NewHandler(store)
	groupHandler := groups.NewHandler(store)
	auditHandler := audit.NewHandler(store)
	tagHandler := tags.NewHandler(store)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(logger.RequestLogger)
	r.Use(middleware.Recoverer)

	r.Get("/api-docs/*", httpSwagger.WrapHandler)

	r.Route("/api/v1", func(r chi.Router) {

		// Public routes
		r.Get("/health", handlers.Health)
		r.Get("/version", handlers.Version)
		r.Get("/calendar/u/{token}/*", calendarHandler.ServeUserCalendar)

		r.Post("/auth/login", authHandler.Login)
		r.Get("/auth/config", authHandler.Config)

		if oidcHandler != nil {
			r.Get("/auth/oidc/login", oidcHandler.Login)
			r.Get("/auth/oidc/callback", oidcHandler.Callback)
		}

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(auth.Authenticate(store, cfg))

			r.Route("/scanners", func(r chi.Router) {
				r.Group(func(r chi.Router) {
					r.Use(auth.RequirePermission(permission.ScannersView))
					r.Get("/", tokenHandler.List)
					r.Get("/{scannerID}", tokenHandler.Get)
				})
				r.Group(func(r chi.Router) {
					r.Use(auth.RequirePermission(permission.ScannersEdit))
					r.Post("/", tokenHandler.Create)
					r.Route("/{scannerID}", func(r chi.Router) {
						r.Put("/", tokenHandler.Update)
						r.Delete("/", tokenHandler.Delete)
						r.Post("/default", tokenHandler.SetDefault)
					})
				})
			})

			r.Route("/alerts", func(r chi.Router) {
				// TODO IGNORE FOR NOW
			})

			r.Route("/certificates", func(r chi.Router) {
				r.Group(func(r chi.Router) {
					r.Use(auth.RequirePermission(permission.CertsView))
					r.Get("/", certHandler.List)
					r.Get("/active", certHandler.Active)
					r.Get("/expiring", certHandler.Expiring)
				})
				r.Group(func(r chi.Router) {
					r.Use(auth.RequirePermission(permission.CertsEdit))
					r.Post("/", certHandler.Create)
				})
				r.Route("/{fingerprint}", func(r chi.Router) {
					r.Group(func(r chi.Router) {
						r.Use(auth.RequirePermission(permission.CertsView))
						r.Get("/", certHandler.Get)
						r.Get("/endpoints", certHandler.GetEndpoints)
					})
					r.Group(func(r chi.Router) {
						r.Use(auth.RequirePermission(permission.CertsEdit))
						r.Delete("/", certHandler.Delete)
					})
				})
			})

			r.Route("/endpoints", func(r chi.Router) {
				r.Group(func(r chi.Router) {
					r.Use(auth.RequirePermission(permission.EndpointsView))
					r.Get("/", endpointHandler.List)
				})
				r.Group(func(r chi.Router) {
					r.Use(auth.RequirePermission(permission.EndpointsEdit))
					r.Post("/", endpointHandler.Create)
				})
				r.Route("/{endpointID}", func(r chi.Router) {
					r.Group(func(r chi.Router) {
						r.Use(auth.RequirePermission(permission.EndpointsView))
						r.Get("/", endpointHandler.Get)
						r.Get("/tls-profile", endpointHandler.GetTLSProfile)
						r.Get("/history", endpointHandler.History)
						r.Get("/tags", tagHandler.GetEndpointTags)
					})
					r.Group(func(r chi.Router) {
						r.Use(auth.RequirePermission(permission.EndpointsEdit))
						r.Put("/", endpointHandler.Update)
						r.Delete("/", endpointHandler.Delete)
						r.Post("/certificate", endpointHandler.LinkCertificate)
						r.Put("/tags", tagHandler.SetEndpointTags)
					})
				})
			})

			// /me — any authenticated user, scoped to themselves.
			r.Route("/me", func(r chi.Router) {
				r.Use(auth.RequirePermission(permission.SelfRead))
				r.Get("/", userHandler.Me)
				r.Put("/", userHandler.UpdateMe)
				r.Patch("/password", userHandler.ChangeMyPassword)
				r.Post("/calendar-token", userHandler.RotateCalendarToken)
			})

			r.Route("/users", func(r chi.Router) {
				r.Group(func(r chi.Router) {
					r.Use(auth.RequirePermission(permission.UsersView))
					r.Get("/", userHandler.List)
				})
				r.Group(func(r chi.Router) {
					r.Use(auth.RequirePermission(permission.UsersEdit))
					r.Post("/", userHandler.Create)
				})
				r.Route("/{userID}", func(r chi.Router) {
					r.Group(func(r chi.Router) {
						r.Use(auth.RequirePermission(permission.UsersView))
						r.Get("/", userHandler.Get)
					})
					r.Group(func(r chi.Router) {
						r.Use(auth.RequirePermission(permission.UsersEdit))
						r.Put("/", userHandler.Update)
						r.Delete("/", userHandler.Delete)
						r.Patch("/password", userHandler.ChangePassword)
						r.Patch("/enabled", userHandler.SetEnabled)
					})
				})
			})

			r.Route("/groups", func(r chi.Router) {
				r.Group(func(r chi.Router) {
					r.Use(auth.RequirePermission(permission.GroupsView))
					r.Get("/", groupHandler.List)
				})
				r.Group(func(r chi.Router) {
					r.Use(auth.RequirePermission(permission.GroupsEdit))
					r.Post("/", groupHandler.Create)
				})
				r.Route("/{groupID}", func(r chi.Router) {
					r.Group(func(r chi.Router) {
						r.Use(auth.RequirePermission(permission.GroupsView))
						r.Get("/", groupHandler.Get)
						r.Get("/endpoints", groupHandler.GetEndpoints)
					})
					r.Group(func(r chi.Router) {
						r.Use(auth.RequirePermission(permission.GroupsEdit))
						r.Put("/", groupHandler.Update)
						r.Delete("/", groupHandler.Delete)
					})
				})
			})

			r.Route("/settings", func(r chi.Router) {
				r.Group(func(r chi.Router) {
					r.Use(auth.RequirePermission(permission.SettingsView))
					r.Get("/alert-thresholds", settingsHandler.GetAlertThresholds)
					r.Get("/audit-logs", auditHandler.List)
				})
				r.Group(func(r chi.Router) {
					r.Use(auth.RequirePermission(permission.SettingsEdit))
					r.Put("/alert-thresholds", settingsHandler.SetAlertThresholds)
				})
				r.Route("/mail", func(r chi.Router) {
					r.Group(func(r chi.Router) {
						r.Use(auth.RequirePermission(permission.SettingsView))
						r.Get("/", mailHandler.Get)
					})
					r.Group(func(r chi.Router) {
						r.Use(auth.RequirePermission(permission.SettingsEdit))
						r.Put("/", mailHandler.Save)
						r.Post("/test", mailHandler.Test)
					})
				})
			})

			r.Route("/tags", func(r chi.Router) {
				r.Route("/categories", func(r chi.Router) {
					r.Group(func(r chi.Router) {
						r.Use(auth.RequirePermission(permission.TagsView))
						r.Get("/", tagHandler.ListCategories)
					})
					r.Group(func(r chi.Router) {
						r.Use(auth.RequirePermission(permission.TagsEdit))
						r.Post("/", tagHandler.CreateCategory)
						r.Put("/{categoryID}", tagHandler.UpdateCategory)
						r.Delete("/{categoryID}", tagHandler.DeleteCategory)
					})
				})
				r.Group(func(r chi.Router) {
					r.Use(auth.RequirePermission(permission.TagsEdit))
					r.Post("/", tagHandler.CreateTag)
					r.Put("/{tagID}", tagHandler.UpdateTag)
					r.Delete("/{tagID}", tagHandler.DeleteTag)
				})
			})

			r.Route("/utils", func(r chi.Router) {
				r.Use(auth.RequirePermission(permission.EndpointsView))
				r.Get("/resolve", utilsHandler.Resolve)
			})

			r.Route("/probe", func(r chi.Router) {
				r.Use(probe.RequireScanner)
				r.Get("/config", scannerHandler.Config)
				r.Get("/hosts", scannerHandler.Hosts)
				r.Post("/hosts/{hostID}/result", scannerHandler.Result)
				r.Post("/hosts/{hostID}/tls-profile", scannerHandler.TLSProfile)
				r.Get("/saml", scannerHandler.SAMLEndpoints)
				r.Post("/saml/{endpointID}/result", scannerHandler.SAMLResult)
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

	return r, nil
}
