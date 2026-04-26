package iputil

import "testing"

func TestLooksLikeIP(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		// Empty / too short.
		{"", false},
		{"1", false},

		// IPv4 happy paths.
		{"10.0", true},
		{"10.0.5", true},
		{"10.0.5.7", true},
		{"192.168.1.1", true},
		{"255.255.255.255", true},
		{"0.0.0.0", true},

		// IPv4 ambiguous — bare digits without a dot are too ambiguous
		// with general text labels and revert to text search.
		{"10", false},
		{"123", false},

		// IPv6 happy paths.
		{"fe80::1", true},
		{"::1", true},
		{"::", true},
		{"2606:4700::1111", true},
		{"AB:CD::1", true},

		// Mixed alphanumerics with a dot but no colon — looks like a
		// hostname or version string, not an IP. Fall back to text.
		{"abc.def", false},
		{"v1.2", false},
		{"web.example.com", false},

		// Disqualifying characters force text mode.
		{"10.0.5.7/24", false},   // CIDR not yet supported.
		{"10.0.5.7-pool", false}, // trailing label.
		{"foo bar", false},
		{"web*", false},

		// Plain text.
		{"foo", false},
		{"endpoint-1", false},
	}
	for _, tc := range cases {
		got := LooksLikeIP(tc.in)
		if got != tc.want {
			t.Errorf("LooksLikeIP(%q) = %v, want %v", tc.in, got, tc.want)
		}
	}
}
