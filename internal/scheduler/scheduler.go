// Package scheduler provides a thin wrapper around go-cron for running
// named periodic maintenance jobs inside the server process.
// Job schedules are loaded from the database at startup — the cron spec
// and enabled flag for each job live in tlsentinel.scheduled_jobs.
package scheduler

import (
	"context"

	"go.uber.org/zap"

	"github.com/netresearch/go-cron"
)

// JobFunc is a named function to be executed on a schedule.
type JobFunc struct {
	Name string
	Fn   func()
}

// Scheduler wraps a cron instance and manages named jobs.
type Scheduler struct {
	c        *cron.Cron
	jobs     []JobFunc
	entryIDs map[string]cron.EntryID  // job name → cron entry ID
	registry map[string]func()        // job name → function
}

// New creates a scheduler that runs in the server's local timezone.
func New(registry map[string]func()) *Scheduler {
	c := cron.New()
	return &Scheduler{
		c:        c,
		entryIDs: make(map[string]cron.EntryID),
		registry: registry,
	}
}

// Func returns the registered function for a job name, or nil if not found.
func (s *Scheduler) Func(name string) func() {
	return s.registry[name]
}

// Add registers a job with the given cron spec. Call before Start.
func (s *Scheduler) Add(spec, name string, fn func()) {
	id, err := s.c.AddFunc(spec, func() {
		zap.L().Info("job starting", zap.String("job", name))
		fn()
		zap.L().Info("job completed", zap.String("job", name))
	})
	if err != nil {
		zap.L().Error("failed to register job",
			zap.String("job", name),
			zap.String("spec", spec),
			zap.Error(err),
		)
		return
	}
	s.entryIDs[name] = id
	zap.L().Info("job registered",
		zap.String("job", name),
		zap.String("spec", spec),
	)
}

// Reload removes the existing entry for a job and re-registers it with a new
// spec and enabled flag. If enabled is false the job is removed and not re-added.
func (s *Scheduler) Reload(name, spec string, enabled bool, fn func()) {
	if id, ok := s.entryIDs[name]; ok {
		s.c.Remove(id)
		delete(s.entryIDs, name)
		zap.L().Info("job removed for reload", zap.String("job", name))
	}
	if !enabled {
		zap.L().Info("job disabled, not re-registering", zap.String("job", name))
		return
	}
	s.Add(spec, name, fn)
}

// Start begins the cron loop. It returns immediately; jobs run in background
// goroutines. Cancel ctx to trigger a graceful stop.
func (s *Scheduler) Start(ctx context.Context) {
	s.c.Start()
	zap.L().Info("scheduler started", zap.Int("jobs", len(s.jobs)))

	go func() {
		<-ctx.Done()
		s.stop()
	}()
}

// stop halts the cron runner and waits for any running job to finish.
func (s *Scheduler) stop() {
	zap.L().Info("scheduler stopping")
	ctx := s.c.Stop()
	<-ctx.Done()
	zap.L().Info("scheduler stopped")
}
