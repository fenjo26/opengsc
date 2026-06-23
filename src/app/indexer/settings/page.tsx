"use client";

import { useEffect, useState } from "react";
import { Code, Copy, Check, Info, Globe, Shield, RefreshCw } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

interface DomainOpt {
  id: string;
  domain: string;
  apiKey: string;
  moneyUrl: string | null;
  allowedBots: string;
}

export default function IndexerSettingsPage() {
  const { t } = useLanguage();
  const [domains, setDomains] = useState<DomainOpt[]>([]);
  const [selectedDomainId, setSelectedDomainId] = useState("");
  const [publicUrl, setPublicUrl] = useState("http://localhost:3001");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isLarge, setIsLarge] = useState(false);

  useEffect(() => {
    // Load public URL from localStorage if set
    const savedUrl = localStorage.getItem("indexerPublicUrl");
    if (savedUrl) setPublicUrl(savedUrl);

    setIsLarge(window.innerWidth > 768);

    // Fetch domains
    const fetchDomains = async () => {
      try {
        const res = await fetch("/api/indexer/domains");
        if (res.ok) {
          const d = await res.json();
          setDomains(d);
          if (d.length > 0) setSelectedDomainId(d[0].id);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchDomains();
  }, []);

  const savePublicUrl = (url: string) => {
    setPublicUrl(url);
    localStorage.setItem("indexerPublicUrl", url);
  };

  const selectedDomain = domains.find(d => d.id === selectedDomainId);

  // Generate PHP Script Content Dynamically
  const phpScriptContent = `<?php
// ─── OpenGSC Private Indexer Doorway Script ───
// Save as index.php in your doorway root folder.
// Ensure you have wildcard DNS and rewrite rules to route all traffic to index.php.

define('API_URL', '${publicUrl.replace(/\/$/, "")}/api/indexer/webhook');
define('API_KEY', '${selectedDomain?.apiKey || "YOUR_DOMAIN_API_KEY_HERE"}');
define('REDIRECT_TARGET', '${selectedDomain?.moneyUrl || "https://your-money-site.com"}');
define('ALLOWED_BOTS', '${selectedDomain?.allowedBots || "google,bing,yandex,mailru"}');
define('STRICT_VERIFICATION', true); // Verify bots via Reverse & Forward DNS lookup to filter out fake User-Agents

// ─── BOT DETECTION LOGIC ───
$user_agent = isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '';
$ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '0.0.0.0';
$uri = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/';
$host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
$referer = isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '';

$is_bot = false;
$detected_bot_type = '';
$ua_lower = strtolower($user_agent);

if (strpos($ua_lower, 'googlebot') !== false || strpos($ua_lower, 'google-co') !== false) {
    $is_bot = true;
    $detected_bot_type = 'google';
} elseif (strpos($ua_lower, 'bingbot') !== false || strpos($ua_lower, 'bingpreview') !== false) {
    $is_bot = true;
    $detected_bot_type = 'bing';
} elseif (strpos($ua_lower, 'yandex') !== false) {
    $is_bot = true;
    $detected_bot_type = 'yandex';
} elseif (strpos($ua_lower, 'mail.ru') !== false || strpos($ua_lower, 'mailru') !== false) {
    $is_bot = true;
    $detected_bot_type = 'mailru';
} elseif (strpos($ua_lower, 'bot') !== false || strpos($ua_lower, 'crawler') !== false || strpos($ua_lower, 'spider') !== false) {
    $is_bot = true;
    $detected_bot_type = 'other';
}

// Perform double DNS lookup (rDNS + Forward IP match) to verify search engines
if ($is_bot && STRICT_VERIFICATION && in_array($detected_bot_type, array('google', 'yandex', 'bing', 'mailru'))) {
    $is_bot = verify_bot_dns($ip, $detected_bot_type);
}

// ─── ROUTE VISITOR ───
if ($is_bot) {
    // 1. Serve 304 conditional check (saves server load & crawler budget)
    $etag = md5($host . $uri . date('Y-m-d'));
    if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
        // Send a 304 log ping so OpenGSC registers the crawler visit
        send_log_ping(false, 304);
        header("HTTP/1.1 304 Not Modified");
        exit;
    }
    
    // Send a 200 log ping
    send_log_ping(false, 200);
    header("ETag: $etag");
    header("Content-Type: text/html; charset=UTF-8");

    // 2. Render dynamic messy doorway content
    $niche_words = array("deals", "shop", "discount", "sale", "online", "price", "review", "best", "cheap", "quality", "free", "shipping");
    $rand_title = ucfirst($niche_words[array_rand($niche_words)]) . " " . $niche_words[array_rand($niche_words)] . " deals sandbox";
    
    echo "<!DOCTYPE html><html><head><title>" . htmlspecialchars($rand_title) . "</title></head><body style='font-family: sans-serif; padding: 20px;'>";
    echo "<h1>" . htmlspecialchars($rand_title) . "</h1>";
    echo "<p>Crawl pool semantic markup sandbox:</p>";
    
    // Generate text mash
    echo "<div>";
    for ($i = 0; $i < 60; $i++) {
        echo htmlspecialchars($niche_words[array_rand($niche_words)]) . " ";
    }
    echo "</div>";

    // Random crosslinks to next subdomains
    echo "<br/><br/><a href='?p=" . rand(100, 9999) . "'>Next internal link &rarr;</a>";
    echo "</body></html>";
    exit;
} else {
    // Human visitor or fake bot - trigger redirect webhook and redirect
    send_log_ping(true, 302);
    header("Location: " . REDIRECT_TARGET, true, 302);
    exit;
}

function verify_bot_dns($ip, $bot_type) {
    // Step 1: Reverse DNS lookup
    $hostname = gethostbyaddr($ip);
    if (!$hostname || $hostname === $ip) {
        return false;
    }
    
    // Step 2: Check domain patterns
    $is_valid_domain = false;
    if ($bot_type === 'google') {
        if (preg_match('/\.googlebot\.com$/i', $hostname) || preg_match('/\.google\.com$/i', $hostname)) {
            $is_valid_domain = true;
        }
    } elseif ($bot_type === 'yandex') {
        if (preg_match('/\.yandex\.(ru|net|com)$/i', $hostname)) {
            $is_valid_domain = true;
        }
    } elseif ($bot_type === 'bing') {
        if (preg_match('/\.search\.msn\.com$/i', $hostname)) {
            $is_valid_domain = true;
        }
    } elseif ($bot_type === 'mailru') {
        if (preg_match('/\.mail\.ru$/i', $hostname)) {
            $is_valid_domain = true;
        }
    }
    
    if (!$is_valid_domain) {
        return false;
    }
    
    // Step 3: Forward DNS lookup to verify original IP
    $resolved_ip = gethostbyname($hostname);
    return ($resolved_ip === $ip);
}

function send_log_ping($is_redirect, $status_code = 200) {
    global $user_agent, $ip, $uri, $host, $referer;
    
    $payload = json_encode(array(
        'apiKey' => API_KEY,
        'url' => 'https://' . $host . $uri,
        'ip' => $ip,
        'userAgent' => $user_agent,
        'statusCode' => $status_code,
        'referer' => $referer,
        'isRedirect' => $is_redirect
    ));

    $ch = curl_init(API_URL);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
    curl_setopt($ch, CURLOPT_TIMEOUT, 2); // fail fast so user load is not delayed
    curl_exec($ch);
    curl_close($ch);
}
`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(phpScriptContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Description Banner */}
      <div style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "16px",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "4px"
      }}>
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
          {t("indexerTabSettings")}
        </h2>
        <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5 }}>
          {t("indexerTabDescSettings")}
        </p>
      </div>
      
      {/* Settings inputs */}
      <div style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "16px",
        padding: "20px",
        gridTemplateColumns: isLarge ? "1fr 1fr" : "1fr",
        gap: "20px",
      }}>
        {/* Public Endpoint URL */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>
            OpenGSC Public Deployment URL
          </label>
          <input
            type="text"
            value={publicUrl}
            onChange={e => savePublicUrl(e.target.value)}
            placeholder="https://opengsc.mydomain.com"
            style={{
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              padding: "8px 12px",
              fontSize: "13px",
              color: "var(--color-text-primary)",
              outline: "none"
            }}
          />
          <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
            Used to tell the PHP script where to send cURL logs. Do not include trailing slashes.
          </span>
        </div>

        {/* Selected Domain */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>
            Select Domain for API pre-fill
          </label>
          <select
            value={selectedDomainId}
            onChange={e => setSelectedDomainId(e.target.value)}
            disabled={loading || domains.length === 0}
            style={{
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              padding: "8px 12px",
              fontSize: "13px",
              color: "var(--color-text-primary)",
              outline: "none",
              width: "100%"
            }}
          >
            {loading ? (
              <option>Loading domains...</option>
            ) : domains.length === 0 ? (
              <option>No domains added yet</option>
            ) : (
              domains.map(d => (
                <option key={d.id} value={d.id}>{d.domain}</option>
              ))
            )}
          </select>
          <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
            Pre-fills credentials and redirect targets in the PHP script copybox below.
          </span>
        </div>
      </div>

      {/* Code Box container */}
      <div style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "16px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px"
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Code size={16} color="var(--color-accent-blue)" />
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
              PHP Doorway Script (index.php)
            </h3>
          </div>
          <button
            onClick={copyToClipboard}
            disabled={domains.length === 0}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              background: "var(--color-accent-blue)",
              color: "#fff",
              fontSize: "12px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              opacity: domains.length === 0 ? 0.7 : 1,
              transition: "background 0.15s"
            }}
            onMouseOver={e => { if (domains.length > 0) e.currentTarget.style.background = "var(--color-accent-blue-dark)"; }}
            onMouseOut={e => { if (domains.length > 0) e.currentTarget.style.background = "var(--color-accent-blue)"; }}
          >
            {copied ? <Check size={14} color="#fff" /> : <Copy size={14} />}
            {copied ? "Copied!" : "Copy Code"}
          </button>
        </div>

        {domains.length === 0 ? (
          <div style={{
            padding: "40px",
            border: "1px dashed var(--color-border)",
            borderRadius: "12px",
            textAlign: "center",
            color: "var(--color-text-secondary)",
            fontSize: "13px"
          }}>
            Please add at least one domain to your farm to configure credentials.
          </div>
        ) : (
          <div style={{
            background: "var(--color-bg)",
            borderRadius: "12px",
            border: "1px solid var(--color-border-soft)",
            maxHeight: "350px",
            overflowY: "auto",
            padding: "16px",
            margin: 0
          }}>
            <pre style={{
              margin: 0,
              fontSize: "12px",
              lineHeight: 1.5,
              color: "var(--color-text-primary)",
              fontFamily: "monospace",
              whiteSpace: "pre"
            }}>
              {phpScriptContent}
            </pre>
          </div>
        )}

        <div style={{
          display: "flex",
          gap: "8px",
          padding: "10px 14px",
          borderRadius: "8px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid var(--color-border-soft)",
          fontSize: "12px",
          color: "var(--color-text-secondary)",
          alignItems: "flex-start"
        }}>
          <Shield size={14} color="var(--color-accent-green)" style={{ marginTop: "2px", flexShrink: 0 }} />
          <span>
            <strong>How cloaking works:</strong> Human visits triggers redirection webhook and redirects to target money site. Bots receive keyword mash pages (served with ETag + 200/304 response) and send crawl logs webhook to OpenGSC.
          </span>
        </div>
      </div>

      {/* Setup Instructions Card */}
      <div style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "16px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Info size={16} color="var(--color-accent-blue)" />
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
            {t("indexerHelpTitle")}
          </h3>
        </div>
        <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5 }}>
          {t("indexerHelpIntro")}
        </p>

        <div style={{
          display: "grid",
          gridTemplateColumns: isLarge ? "1fr 1fr" : "1fr",
          gap: "16px",
          marginTop: "8px"
        }}>
          {[1, 2, 3, 4].map(step => (
            <div key={step} style={{
              background: "var(--color-bg)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: "10px",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "6px"
            }}>
              <h4 style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
                {t(`indexerStep${step}Title` as any)}
              </h4>
              <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.4 }}>
                {t(`indexerStep${step}Text` as any)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
