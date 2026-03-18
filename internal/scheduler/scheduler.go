// Package scheduler provides a thin wrapper around go-cron for running
// named periodic maintenance jobs inside the server process.
package scheduler

import (
	"context"

	"go.uber.org/zap"

	"github.com/netresearch/go-cron"
)

// Job is a named function to be executed on a schedule.
type Job struct {
	Name string
	Spec string // standard cron expression or shorthand e.g. "@midnight"
	Fn   func()
}

// Scheduler wraps a cron instance and manages named jobs.
type Scheduler struct {
	c    *cron.Cron
	jobs []Job
}

// New creates a scheduler that runs in the server's local timezone.
func New() *Scheduler {
	c := cron.New()
	return &Scheduler{c: c}
}

// Add registers a job. Call before Start.
func (s *Scheduler) Add(spec, name string, fn func()) {
	s.jobs = append(s.jobs, Job{Name: name, Spec: spec, Fn: fn})
}

// Start registers all jobs and begins the cron loop.
// It returns immediately; jobs run in background goroutines.
// Cancel ctx to trigger a graceful Stop.
func (s *Scheduler) Start(ctx context.Context) {
	for _, j := range s.jobs {
		j := j // capture
		if _, err := s.c.AddFunc(j.Spec, func() {
			zap.L().Info("job starting", zap.String("job", j.Name))
			j.Fn()
			zap.L().Info("job completed", zap.String("job", j.Name))
		}); err != nil {
			zap.L().Error("failed to register job",
				zap.String("job", j.Name),
				zap.String("spec", j.Spec),
				zap.Error(err),
			)
		} else {
			zap.L().Info("job registered",
				zap.String("job", j.Name),
				zap.String("spec", j.Spec),
			)
		}
	}

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
