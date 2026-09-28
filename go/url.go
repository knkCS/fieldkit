package fieldkit

import (
	"net"
	"net/url"
	"strconv"
	"strings"
)

// isURL is Zod 3's z.string().url(), which accepts whatever JS's new URL(s)
// parses without a base. That is the WHATWG URL parser; this is the part of
// it that decides success, not the part that serialises:
//
//   - leading and trailing C0 controls and spaces are ignored, and tabs and
//     line breaks anywhere;
//   - a scheme is required: a letter, then letters, digits, "+", "-" or ".",
//     then ":";
//   - a special scheme (http, https, ws, wss, ftp) needs a host, file may
//     have none, and any other scheme has an optional opaque host after "//"
//     or none at all;
//   - a port is decimal digits no greater than 65535;
//   - a domain, percent-decoded, holds no forbidden code point, and one
//     ending in a number must be a valid IPv4 address; "[...]" must be IPv6.
//
// What it does not do is IDNA: a non-ASCII domain is accepted as it stands,
// where a browser might refuse one IDNA rejects. The conformance fixtures
// hold the two together on everything else.
func isURL(s string) bool {
	s = strings.TrimFunc(s, func(r rune) bool { return r <= 0x20 })
	s = strings.NewReplacer("\t", "", "\n", "", "\r", "").Replace(s)

	colon := strings.IndexByte(s, ':')
	if colon <= 0 || !isScheme(s[:colon]) {
		return false
	}
	scheme := strings.ToLower(s[:colon])
	rest := s[colon+1:]

	switch scheme {
	case "http", "https", "ws", "wss", "ftp":
		return validAuthority(authorityOf(strings.TrimLeft(rest, `/\`), true), true, false)
	case "file":
		// file:// then a host that may be empty, and no credentials or port;
		// anything else is a path.
		if len(rest) < 2 || !isSlash(rest[0]) || !isSlash(rest[1]) {
			return true
		}
		host := authorityOf(rest[2:], true)
		return host == "" || isDriveLetter(host) || validHost(host, true)
	default:
		if !strings.HasPrefix(rest, "//") {
			return true // an opaque path: anything goes
		}
		return validAuthority(authorityOf(rest[2:], false), false, true)
	}
}

func isScheme(s string) bool {
	for i, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z':
		case i > 0 && (r >= '0' && r <= '9' || r == '+' || r == '-' || r == '.'):
		default:
			return false
		}
	}
	return true
}

// authorityOf is what follows the slashes, up to the path, query or fragment.
// A special URL's path may also start with a backslash.
func authorityOf(s string, special bool) string {
	end := "/?#"
	if special {
		end += `\`
	}
	if i := strings.IndexAny(s, end); i >= 0 {
		return s[:i]
	}
	return s
}

// validAuthority checks [userinfo@]host[:port]. special hosts are domains
// or IP addresses; others are opaque. emptyHost says whether no host at all
// is allowed.
func validAuthority(authority string, special, emptyHost bool) bool {
	hostport := authority
	if at := strings.LastIndexByte(authority, '@'); at >= 0 {
		hostport = authority[at+1:]
		if hostport == "" {
			return false // credentials without a host
		}
	}
	host, port := hostport, ""
	if strings.HasPrefix(hostport, "[") {
		end := strings.IndexByte(hostport, ']')
		if end < 0 {
			return false
		}
		host, port = hostport[:end+1], hostport[end+1:]
		if port != "" {
			if port[0] != ':' {
				return false
			}
			port = port[1:]
		}
	} else if i := strings.IndexByte(hostport, ':'); i >= 0 {
		host, port = hostport[:i], hostport[i+1:]
	}
	if port != "" {
		for _, r := range port {
			if r < '0' || r > '9' {
				return false
			}
		}
		if n, err := strconv.ParseUint(port, 10, 64); err != nil || n > 65535 {
			return false
		}
	}
	if host == "" {
		// A port without a host is refused even where no host is fine.
		return emptyHost && port == "" && !strings.Contains(hostport, ":")
	}
	return validHost(host, special)
}

// validHost checks a host: "[...]" is an IPv6 address; a special URL's host
// is a domain or an IPv4 address; any other URL's is opaque.
func validHost(host string, special bool) bool {
	if strings.HasPrefix(host, "[") {
		if !strings.HasSuffix(host, "]") {
			return false
		}
		ip := host[1 : len(host)-1]
		return strings.Contains(ip, ":") && !strings.Contains(ip, "%") && net.ParseIP(ip) != nil
	}
	if !special {
		return !strings.ContainsAny(host, forbiddenHost+"\x00")
	}
	decoded, err := url.PathUnescape(host)
	if err != nil {
		// url.PathUnescape refuses a stray "%"; WHATWG leaves it be, and then
		// refuses it as a forbidden code point. Either way, no host.
		return false
	}
	if decoded == "" || strings.ContainsAny(decoded, forbiddenDomain) || strings.ContainsFunc(decoded, isC0OrDel) {
		return false
	}
	if endsInNumber(decoded) {
		return validIPv4(decoded)
	}
	return true
}

func isSlash(b byte) bool { return b == '/' || b == '\\' }

// isDriveLetter is a Windows drive letter where a file URL's host would be:
// "C:" or "C|", which the parser takes as the start of the path.
func isDriveLetter(s string) bool {
	return len(s) == 2 && (s[0] >= 'a' && s[0] <= 'z' || s[0] >= 'A' && s[0] <= 'Z') && (s[1] == ':' || s[1] == '|')
}

// forbiddenHost are the WHATWG forbidden host code points, bar the C0
// controls and DEL that isC0OrDel covers.
const forbiddenHost = " #/:<>?@[\\]^|"

// forbiddenDomain adds "%" to them, for a domain after percent-decoding.
const forbiddenDomain = forbiddenHost + "%"

func isC0OrDel(r rune) bool { return r < 0x20 || r == 0x7f }

// endsInNumber is the WHATWG "ends in a number" test: the last label (or the
// one before a trailing dot) is decimal digits, or 0x and hex digits.
func endsInNumber(host string) bool {
	labels := strings.Split(host, ".")
	last := labels[len(labels)-1]
	if last == "" {
		if len(labels) == 1 {
			return false
		}
		last = labels[len(labels)-2]
	}
	if last != "" && strings.Trim(last, "0123456789") == "" {
		return true
	}
	_, ok := ipv4Number(last)
	return ok && (strings.HasPrefix(last, "0x") || strings.HasPrefix(last, "0X"))
}

// validIPv4 is the WHATWG IPv4 parser's success: at most four parts, each a
// decimal, octal (leading 0) or hex (0x) number, all but the last below 256,
// and the last below 256 to the power of the parts it stands for.
func validIPv4(host string) bool {
	parts := strings.Split(host, ".")
	if parts[len(parts)-1] == "" && len(parts) > 1 {
		parts = parts[:len(parts)-1]
	}
	if len(parts) > 4 {
		return false
	}
	nums := make([]uint64, len(parts))
	for i, p := range parts {
		n, ok := ipv4Number(p)
		if !ok {
			return false
		}
		nums[i] = n
	}
	for _, n := range nums[:len(nums)-1] {
		if n > 255 {
			return false
		}
	}
	limit := uint64(1) << (8 * (5 - len(nums)))
	return nums[len(nums)-1] < limit
}

func ipv4Number(s string) (uint64, bool) {
	if s == "" {
		return 0, false
	}
	base := 10
	switch {
	case len(s) >= 2 && (s[:2] == "0x" || s[:2] == "0X"):
		s, base = s[2:], 16
		if s == "" {
			return 0, true
		}
	case len(s) >= 2 && s[0] == '0':
		s, base = s[1:], 8
	}
	n, err := strconv.ParseUint(s, base, 64)
	if err != nil {
		// Too large for uint64 is still a number, just out of range.
		if ne, ok := err.(*strconv.NumError); ok && ne.Err == strconv.ErrRange {
			return 1 << 40, true
		}
		return 0, false
	}
	return n, true
}
