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
	c    *cron.Cron
	jobs []JobFunc
}

// New creates a scheduler that runs in the server's local timezone.
func New() *Scheduler {
	c := cron.New()
	return &Scheduler{c: c}
}

// Add registers a job with the given cron spec. Call before Start.
func (s *Scheduler) Add(spec, name string, fn func()) {
	s.jobs = append(s.jobs, JobFunc{Name: name, Fn: fn})
	j := s.jobs[len(s.jobs)-1]
	if _, err := s.c.AddFunc(spec, func() {
		zap.L().Info("job starting", zap.String("job", j.Name))
		j.Fn()
		zap.L().Info("job completed", zap.String("job", j.Name))
	}); err != nil {
		zap.L().Error("failed to register job",
			zap.String("job", j.Name),
			zap.String("spec", spec),
			zap.Error(err),
		)
	} else {
		zap.L().Info("job registered",
			zap.String("job", j.Name),
			zap.String("spec", spec),
		)
	}
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
