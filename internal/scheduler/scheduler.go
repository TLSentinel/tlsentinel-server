// Package scheduler provides a thin wrapper around go-cron for running
// named periodic maintenance jobs inside the server process.
// Job schedules are loaded from the database at startup — the cron spec
// and enabled flag for each job live in tlsentinel.scheduled_jobs.
package scheduler

import (
	"context"
	"time"

	"go.uber.org/zap"

	"github.com/netresearch/go-cron"
)

// DefaultJobTimeout bounds how long any single job invocation may run.
// Jobs must honor the context passed to them — a hung job that ignores
// cancellation cannot be forcibly stopped, but the context deadline
// propagates into DB calls and prevents unbounded resource consumption.
const DefaultJobTimeout = 30 * time.Minute

// JobFunc is a named function to be executed on a schedule.
type JobFunc struct {
	Name string
	Fn   func(context.Context)
}

// Scheduler wraps a cron instance and manages named jobs.
type Scheduler struct {
	c        *cron.Cron
	entryIDs map[string]cron.EntryID              // job name → cron entry ID
	registry map[string]func(context.Context)     // job name → function
	parent   context.Context                      // parent ctx for job invocations
	timeout  time.Duration                        // per-invocation timeout
}

// New creates a scheduler that runs in the server's local timezone.
func New(registry map[string]func(context.Context)) *Scheduler {
	return &Scheduler{
		c:        cron.New(),
		entryIDs: make(map[string]cron.EntryID),
		registry: registry,
		parent:   context.Background(),
		timeout:  DefaultJobTimeout,
	}
}

// Func returns the registered function for a job name, or nil if not found.
func (s *Scheduler) Func(name string) func(context.Context) {
	return s.registry[name]
}

// Add registers a job with the given cron spec. Call before Start.
// Each invocation runs with a fresh context derived from the scheduler's
// parent context and bounded by DefaultJobTimeout.
func (s *Scheduler) Add(spec, name string, fn func(context.Context)) {
	id, err := s.c.AddFunc(spec, func() {
		zap.L().Info("job starting", zap.String("job", name))
		ctx, cancel := context.WithTimeout(s.parent, s.timeout)
		defer cancel()
		fn(ctx)
		if err := ctx.Err(); err != nil {
			zap.L().Warn("job context error",
				zap.String("job", name),
				zap.Duration("timeout", s.timeout),
				zap.Error(err),
			)
			return
		}
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
func (s *Scheduler) Reload(name, spec string, enabled bool, fn func(context.Context)) {
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
// goroutines. Cancel ctx to trigger a graceful stop. The provided ctx also
// becomes the parent for all subsequent job invocations.
func (s *Scheduler) Start(ctx context.Context) {
	s.parent = ctx
	s.c.Start()
	zap.L().Info("scheduler started")

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
