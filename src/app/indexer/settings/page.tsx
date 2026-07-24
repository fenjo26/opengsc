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
  const [integrationType, setIntegrationType] = useState<"php" | "phpStatic" | "astro" | "nginx">("php");

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

  // Effective ALLOWED_BOTS emitted into the doorway script. Tokens: google,bing,yandex,mailru,ai,ai-training.
  // The script enforces this list. Legacy domains (saved before AI existed, so no ai/ai-training token)
  // are upgraded on the fly to keep serving search + AI answer bots, matching current behaviour.
  const effectiveAllowedBots = (() => {
    const raw = (selectedDomain?.allowedBots || "google,bing,yandex,mailru,ai").toLowerCase();
    let tokens = raw.split(",").map(s => s.trim()).filter(Boolean);
    // "cfg" marker = record saved with the new checkboxes (explicit config, respect exactly).
    // No marker = legacy record from before AI existed -> upgrade to keep serving search + AI answer.
    const explicit = tokens.includes("cfg");
    tokens = tokens.filter(t => t !== "cfg");
    if (!explicit) { const set = new Set(tokens); set.add("mailru"); set.add("ai"); tokens = Array.from(set); }
    return tokens.join(",");
  })();

  // Generate PHP Script Content Dynamically (Standard Redirect)
  const phpScriptContent = `<?php
// ─── OpenGSC Private Indexer Doorway Script ───
// Save as index.php in your doorway root folder.
// Ensure you have wildcard DNS and rewrite rules to route all traffic to index.php.

define('API_URL', '${publicUrl.replace(/\/$/, "")}/api/indexer/webhook');
define('API_KEY', '${selectedDomain?.apiKey || "YOUR_DOMAIN_API_KEY_HERE"}');
define('REDIRECT_TARGET', '${selectedDomain?.moneyUrl || "https://your-money-site.com"}');
// Tokens enforced below: google,bing,yandex,mailru,ai (AI answer/GEO), ai-training.
// Uncheck a crawler in the panel -> its token drops here -> that bot stops being served.
define('ALLOWED_BOTS', '${effectiveAllowedBots}');
define('STRICT_VERIFICATION', true); // Verify search bots via Reverse & Forward DNS lookup

// ─── BOT DETECTION LOGIC ───
function get_client_ip() {
    if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) return trim($_SERVER['HTTP_CF_CONNECTING_IP']);
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $ips = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        return trim($ips[0]);
    }
    return isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '0.0.0.0';
}

$user_agent = isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '';
$ip = get_client_ip();
$uri = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/';
$host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
$referer = isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '';

$is_bot = false;
$detected_bot_type = '';
$ua_lower = strtolower($user_agent);

// AI / GEO crawlers. Split into "answer" (live citation -> traffic) and "training" (model ingest).
$ai_answer_bots   = array('oai-searchbot', 'chatgpt-user', 'perplexitybot', 'perplexity-user', 'claudebot', 'claude-user', 'duckassistbot', 'google-extended');
$ai_training_bots = array('gptbot', 'ccbot', 'anthropic-ai', 'bytespider', 'meta-externalagent', 'meta-externalfetcher', 'applebot-extended', 'cohere-ai', 'cohere-training', 'amazonbot', 'diffbot', 'imagesift', 'omgili', 'timpibot', 'youbot');
function ua_matches_any($ua, $list) {
    foreach ($list as $needle) { if (strpos($ua, $needle) !== false) return true; }
    return false;
}

if (strpos($ua_lower, 'googlebot') !== false || strpos($ua_lower, 'google-inspectiontool') !== false || strpos($ua_lower, 'googleother') !== false || strpos($ua_lower, 'google-co') !== false || strpos($ua_lower, 'storebot-google') !== false || strpos($ua_lower, 'google-site-verification') !== false) {
    $is_bot = true;
    $detected_bot_type = 'google';
} elseif (strpos($ua_lower, 'bingbot') !== false || strpos($ua_lower, 'bingpreview') !== false || strpos($ua_lower, 'msnbot') !== false) {
    $is_bot = true;
    $detected_bot_type = 'bing';
} elseif (strpos($ua_lower, 'yandex') !== false) {
    $is_bot = true;
    $detected_bot_type = 'yandex';
} elseif (strpos($ua_lower, 'mail.ru') !== false || strpos($ua_lower, 'mailru') !== false) {
    $is_bot = true;
    $detected_bot_type = 'mailru';
} elseif (ua_matches_any($ua_lower, $ai_answer_bots)) {
    // AI answer/search crawler (GEO traffic source)
    $is_bot = true;
    $detected_bot_type = 'ai';
    $ai_kind = 'answer';
} elseif (ua_matches_any($ua_lower, $ai_training_bots)) {
    // AI training crawler
    $is_bot = true;
    $detected_bot_type = 'ai';
    $ai_kind = 'training';
} elseif (strpos($ua_lower, 'bot') !== false || strpos($ua_lower, 'crawler') !== false || strpos($ua_lower, 'spider') !== false) {
    $is_bot = true;
    $detected_bot_type = 'other';
}

// ─── ENFORCE ALLOWED_BOTS (panel checkboxes) ───
$allowed = array_map('trim', explode(',', strtolower(ALLOWED_BOTS)));

// Search engines: served only if their token is enabled, else treated as a normal visitor
if (in_array($detected_bot_type, array('google', 'bing', 'yandex', 'mailru')) && !in_array($detected_bot_type, $allowed)) {
    $is_bot = false;
    $detected_bot_type = '';
}
// AI answer bots: served only if 'ai' is enabled
if (!empty($ai_kind) && $ai_kind === 'answer' && !in_array('ai', $allowed)) {
    $is_bot = false;
}
// AI training bots: served only if 'ai-training' is enabled, else 403 (no doorway, no money redirect)
if (!empty($ai_kind) && $ai_kind === 'training' && !in_array('ai-training', $allowed)) {
    send_log_ping(false, 403);
    header("HTTP/1.1 403 Forbidden");
    exit;
}

// Double DNS lookup (rDNS + Forward IP match) to verify real search engines
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

    // Money-site promotion — surface REDIRECT_TARGET so search + AI crawlers discover,
    // index and (for GEO) cite/recommend it. Varied anchors keep the footprint natural.
    $money = REDIRECT_TARGET;
    $money_host = preg_replace('#^https?://#', '', rtrim($money, '/'));
    $anchors = array("official site", "read more", "best offer", "visit resource", "full guide", "recommended", "learn more", "see details");
    echo "<p>Recommended resource: <a href='" . htmlspecialchars($money) . "'>" . htmlspecialchars($money_host) . "</a></p>";
    echo "<ul>";
    for ($i = 0; $i < 3; $i++) {
        $anchor = ucfirst($anchors[array_rand($anchors)]) . " " . $niche_words[array_rand($niche_words)];
        echo "<li><a href='" . htmlspecialchars($money) . "'>" . htmlspecialchars($anchor) . "</a></li>";
    }
    echo "</ul>";

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
        if (preg_match('/\\.googlebot\\.com$/i', $hostname) || preg_match('/\\.google\\.com$/i', $hostname) || preg_match('/\\.googleusercontent\\.com$/i', $hostname)) {
            $is_valid_domain = true;
        }
    } elseif ($bot_type === 'yandex') {
        if (preg_match('/\\.yandex\\.(ru|net|com)$/i', $hostname)) {
            $is_valid_domain = true;
        }
    } elseif ($bot_type === 'bing') {
        if (preg_match('/\\.search\\.msn\\.com$/i', $hostname)) {
            $is_valid_domain = true;
        }
    } elseif ($bot_type === 'mailru') {
        if (preg_match('/\\.mail\\.ru$/i', $hostname)) {
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
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    curl_exec($ch);
    curl_close($ch);
}
`;

  // PHP Static Site Wrapper Content (Cloaks static HTML files)
  const phpStaticWrapperContent = `<?php
// ─── OpenGSC Private Indexer Doorway Script (Static Site Wrapper) ───
// Rename your original static index.html to index_real.html.
// Upload this script as index.php in your root folder.
// This script serves index_real.html to humans, and doorway to bots.

define('API_URL', '${publicUrl.replace(/\/$/, "")}/api/indexer/webhook');
define('API_KEY', '${selectedDomain?.apiKey || "YOUR_DOMAIN_API_KEY_HERE"}');
define('REDIRECT_TARGET', '${selectedDomain?.moneyUrl || "https://your-money-site.com"}'); // money site linked to bots
// Tokens enforced below: google,bing,yandex,mailru,ai (AI answer/GEO), ai-training.
define('ALLOWED_BOTS', '${effectiveAllowedBots}');
define('STRICT_VERIFICATION', true);

// ─── BOT DETECTION LOGIC ───
$user_agent = isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '';
$ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '0.0.0.0';
$uri = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/';
$host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
$referer = isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '';

$is_bot = false;
$detected_bot_type = '';
$ua_lower = strtolower($user_agent);

// AI / GEO crawlers. Split into "answer" (live citation -> traffic) and "training" (model ingest).
$ai_answer_bots   = array('oai-searchbot', 'chatgpt-user', 'perplexitybot', 'perplexity-user', 'claudebot', 'claude-user', 'duckassistbot', 'google-extended');
$ai_training_bots = array('gptbot', 'ccbot', 'anthropic-ai', 'bytespider', 'meta-externalagent', 'meta-externalfetcher', 'applebot-extended', 'cohere-ai', 'cohere-training', 'amazonbot', 'diffbot', 'imagesift', 'omgili', 'timpibot', 'youbot');
function ua_matches_any($ua, $list) {
    foreach ($list as $needle) { if (strpos($ua, $needle) !== false) return true; }
    return false;
}

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
} elseif (ua_matches_any($ua_lower, $ai_answer_bots)) {
    $is_bot = true;
    $detected_bot_type = 'ai';
    $ai_kind = 'answer';
} elseif (ua_matches_any($ua_lower, $ai_training_bots)) {
    $is_bot = true;
    $detected_bot_type = 'ai';
    $ai_kind = 'training';
} elseif (strpos($ua_lower, 'bot') !== false || strpos($ua_lower, 'crawler') !== false || strpos($ua_lower, 'spider') !== false) {
    $is_bot = true;
    $detected_bot_type = 'other';
}

// ─── ENFORCE ALLOWED_BOTS (panel checkboxes) ───
$allowed = array_map('trim', explode(',', strtolower(ALLOWED_BOTS)));
if (in_array($detected_bot_type, array('google', 'bing', 'yandex', 'mailru')) && !in_array($detected_bot_type, $allowed)) {
    $is_bot = false;
    $detected_bot_type = '';
}
if (!empty($ai_kind) && $ai_kind === 'answer' && !in_array('ai', $allowed)) {
    $is_bot = false;
}
if (!empty($ai_kind) && $ai_kind === 'training' && !in_array('ai-training', $allowed)) {
    send_log_ping(false, 403);
    header("HTTP/1.1 403 Forbidden");
    exit;
}

if ($is_bot && STRICT_VERIFICATION && in_array($detected_bot_type, array('google', 'yandex', 'bing', 'mailru'))) {
    $is_bot = verify_bot_dns($ip, $detected_bot_type);
}

// ─── ROUTE VISITOR ───
if ($is_bot) {
    $etag = md5($host . $uri . date('Y-m-d'));
    if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
        send_log_ping(false, 304);
        header("HTTP/1.1 304 Not Modified");
        exit;
    }
    
    send_log_ping(false, 200);
    header("ETag: $etag");
    header("Content-Type: text/html; charset=UTF-8");

    $niche_words = array("deals", "shop", "discount", "sale", "online", "price", "review", "best", "cheap", "quality", "free", "shipping");
    $rand_title = ucfirst($niche_words[array_rand($niche_words)]) . " " . $niche_words[array_rand($niche_words)] . " deals sandbox";
    
    echo "<!DOCTYPE html><html><head><title>" . htmlspecialchars($rand_title) . "</title></head><body style='font-family: sans-serif; padding: 20px;'>";
    echo "<h1>" . htmlspecialchars($rand_title) . "</h1>";
    echo "<p>Crawl pool semantic markup sandbox:</p>";
    
    echo "<div>";
    for ($i = 0; $i < 60; $i++) {
        echo htmlspecialchars($niche_words[array_rand($niche_words)]) . " ";
    }
    echo "</div>";

    // Money-site promotion for search + AI (GEO) crawlers
    $money = REDIRECT_TARGET;
    $money_host = preg_replace('#^https?://#', '', rtrim($money, '/'));
    $anchors = array("official site", "read more", "best offer", "visit resource", "full guide", "recommended", "learn more", "see details");
    echo "<p>Recommended resource: <a href='" . htmlspecialchars($money) . "'>" . htmlspecialchars($money_host) . "</a></p>";
    echo "<ul>";
    for ($i = 0; $i < 3; $i++) {
        $anchor = ucfirst($anchors[array_rand($anchors)]) . " " . $niche_words[array_rand($niche_words)];
        echo "<li><a href='" . htmlspecialchars($money) . "'>" . htmlspecialchars($anchor) . "</a></li>";
    }
    echo "</ul>";

    echo "<br/><br/><a href='?p=" . rand(100, 9999) . "'>Next internal link &rarr;</a>";
    echo "</body></html>";
    exit;
} else {
    // Human visitor: serve static HTML from index_real.html
    send_log_ping(false, 200);
    if (file_exists('index_real.html')) {
        include 'index_real.html';
    } else {
        echo "<!DOCTYPE html><html><head><title>Welcome</title></head><body><h1>Welcome to our static site</h1><p>Please upload index_real.html</p></body></html>";
    }
    exit;
}

function verify_bot_dns($ip, $bot_type) {
    $hostname = gethostbyaddr($ip);
    if (!$hostname || $hostname === $ip) return false;
    
    $is_valid_domain = false;
    if ($bot_type === 'google') {
        if (preg_match('/\\.googlebot\\.com$/i', $hostname) || preg_match('/\\.google\\.com$/i', $hostname)) $is_valid_domain = true;
    } elseif ($bot_type === 'yandex') {
        if (preg_match('/\\.yandex\\.(ru|net|com)$/i', $hostname)) $is_valid_domain = true;
    } elseif ($bot_type === 'bing') {
        if (preg_match('/\\.search\\.msn\\.com$/i', $hostname)) $is_valid_domain = true;
    } elseif ($bot_type === 'mailru') {
        if (preg_match('/\\.mail\\.ru$/i', $hostname)) $is_valid_domain = true;
    }
    
    if (!$is_valid_domain) return false;
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
    curl_setopt($ch, CURLOPT_TIMEOUT, 2);
    curl_exec($ch);
    curl_close($ch);
}
\n?>`;

  // Astro Middleware Content
  const astroMiddlewareContent = `// ─── OpenGSC Private Indexer Astro Middleware (src/middleware.ts) ───
// For Astro projects running in SSR mode (Node.js, Vercel, Netlify, Cloudflare).
// Paste this inside src/middleware.ts.

import { defineMiddleware } from "astro:middleware";
import dns from "dns/promises";

const API_URL = "${publicUrl.replace(/\/$/, "")}/api/indexer/webhook";
const API_KEY = "${selectedDomain?.apiKey || "YOUR_DOMAIN_API_KEY_HERE"}";
const REDIRECT_TARGET = "${selectedDomain?.moneyUrl || "https://your-money-site.com"}";
const ALLOWED_BOTS = "${effectiveAllowedBots}"; // tokens: google,bing,yandex,mailru,ai,ai-training
const STRICT_VERIFICATION = true;
// AI / GEO crawlers: "answer" bots cite live pages (traffic), "training" bots only ingest content.
const AI_ANSWER_BOTS = ["oai-searchbot", "chatgpt-user", "perplexitybot", "perplexity-user", "claudebot", "claude-user", "duckassistbot", "google-extended"];
const AI_TRAINING_BOTS = ["gptbot", "ccbot", "anthropic-ai", "bytespider", "meta-externalagent", "meta-externalfetcher", "applebot-extended", "cohere-ai", "cohere-training", "amazonbot", "diffbot", "imagesift", "omgili", "timpibot", "youbot"];

async function verifyBotDns(ip: string, botType: string): Promise<boolean> {
  try {
    const hostnames = await dns.reverse(ip);
    if (!hostnames || hostnames.length === 0) return false;
    const hostname = hostnames[0];

    let isValidDomain = false;
    if (botType === 'google') {
      if (/\\.googlebot\\.com$/i.test(hostname) || /\\.google\\.com$/i.test(hostname)) isValidDomain = true;
    } else if (botType === 'yandex') {
      if (/\\.yandex\\.(ru|net|com)$/i.test(hostname)) isValidDomain = true;
    } else if (botType === 'bing') {
      if (/\\.search\\.msn\\.com$/i.test(hostname)) isValidDomain = true;
    } else if (botType === 'mailru') {
      if (/\\.mail\\.ru$/i.test(hostname)) isValidDomain = true;
    }

    if (!isValidDomain) return false;
    const ips = await dns.resolve(hostname);
    return ips.includes(ip);
  } catch (e) {
    return false;
  }
}

async function sendLogPing(payload: any) {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {}
}

export const onRequest = defineMiddleware(async (context, next) => {
  const userAgent = context.request.headers.get("user-agent") || "";
  const ip = context.request.headers.get("cf-connecting-ip") || 
             context.request.headers.get("x-real-ip") || 
             context.request.headers.get("x-forwarded-for")?.split(",")[0].trim() || 
             "0.0.0.0";
             
  const url = new URL(context.request.url);
  const host = url.host;
  const referer = context.request.headers.get("referer") || "";

  let isBot = false;
  let detectedBotType = "";
  let aiKind = "";
  const uaLower = userAgent.toLowerCase();

  if (uaLower.includes("googlebot") || uaLower.includes("google-co")) {
    isBot = true;
    detectedBotType = "google";
  } else if (uaLower.includes("bingbot") || uaLower.includes("bingpreview")) {
    isBot = true;
    detectedBotType = "bing";
  } else if (uaLower.includes("yandex")) {
    isBot = true;
    detectedBotType = "yandex";
  } else if (uaLower.includes("mail.ru") || uaLower.includes("mailru")) {
    isBot = true;
    detectedBotType = "mailru";
  } else if (AI_ANSWER_BOTS.some(b => uaLower.includes(b))) {
    isBot = true;
    detectedBotType = "ai";
    aiKind = "answer";
  } else if (AI_TRAINING_BOTS.some(b => uaLower.includes(b))) {
    isBot = true;
    detectedBotType = "ai";
    aiKind = "training";
  } else if (uaLower.includes("bot") || uaLower.includes("crawler") || uaLower.includes("spider")) {
    isBot = true;
    detectedBotType = "other";
  }

  // ─── ENFORCE ALLOWED_BOTS (panel checkboxes) ───
  const allowed = ALLOWED_BOTS.toLowerCase().split(",").map(s => s.trim());
  if (["google", "bing", "yandex", "mailru"].includes(detectedBotType) && !allowed.includes(detectedBotType)) {
    isBot = false;
    detectedBotType = "";
  }
  if (aiKind === "answer" && !allowed.includes("ai")) {
    isBot = false;
  }
  if (aiKind === "training" && !allowed.includes("ai-training")) {
    // Block AI training crawlers: no doorway, no money-site redirect
    await sendLogPing({ apiKey: API_KEY, url: context.request.url, ip, userAgent, statusCode: 403, referer, isRedirect: false });
    return new Response("Forbidden", { status: 403 });
  }

  if (isBot && STRICT_VERIFICATION && ["google", "yandex", "bing", "mailru"].includes(detectedBotType)) {
    isBot = await verifyBotDns(ip, detectedBotType);
  }

  const pingPayload = {
    apiKey: API_KEY,
    url: context.request.url,
    ip,
    userAgent,
    statusCode: 200,
    referer,
    isRedirect: false
  };

  if (isBot) {
    const etag = "etag_" + Buffer.from(\`\${host}\${url.pathname}\`).toString("base64").slice(0, 10);
    const ifNoneMatch = context.request.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch.trim() === etag) {
      pingPayload.statusCode = 304;
      context.waitUntil ? context.waitUntil(sendLogPing(pingPayload)) : await sendLogPing(pingPayload);
      return new Response(null, { status: 304 });
    }

    context.waitUntil ? context.waitUntil(sendLogPing(pingPayload)) : await sendLogPing(pingPayload);

    const nicheWords = ["deals", "shop", "discount", "sale", "online", "price", "review", "best", "cheap", "quality", "free", "shipping"];
    const randTitle = nicheWords[Math.floor(Math.random() * nicheWords.length)].charAt(0).toUpperCase() + 
                      nicheWords[Math.floor(Math.random() * nicheWords.length)].slice(1) + " " + 
                      nicheWords[Math.floor(Math.random() * nicheWords.length)] + " deals sandbox";

    let textMash = "";
    for (let i = 0; i < 60; i++) {
      textMash += nicheWords[Math.floor(Math.random() * nicheWords.length)] + " ";
    }

    // Money-site promotion for search + AI (GEO) crawlers
    const moneyHost = REDIRECT_TARGET.replace(/^https?:\\/\\//, "").replace(/\\/$/, "");
    const anchorWords = ["official site", "read more", "best offer", "visit resource", "full guide", "recommended", "learn more", "see details"];
    let moneyLinks = "";
    for (let i = 0; i < 3; i++) {
      const a = anchorWords[Math.floor(Math.random() * anchorWords.length)] + " " + nicheWords[Math.floor(Math.random() * nicheWords.length)];
      moneyLinks += \`<li><a href="\${REDIRECT_TARGET}">\${a}</a></li>\`;
    }

    const html = \`<!DOCTYPE html><html><head><title>\${randTitle}</title></head><body style="font-family: sans-serif; padding: 20px;">
<h1>\${randTitle}</h1>
<p>Crawl pool semantic markup sandbox:</p>
<div>\${textMash}</div>
<p>Recommended resource: <a href="\${REDIRECT_TARGET}">\${moneyHost}</a></p>
<ul>\${moneyLinks}</ul>
<br/><br/><a href="?p=\${Math.floor(Math.random() * 9900) + 100}">Next internal link &rarr;</a>
</body></html>\`;

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
        "ETag": etag
      }
    });
  } else {
    // Serve normal request for human
    return next();
  }
});`;

  // Nginx Config Content
  const nginxConfigContent = `# ─── Nginx Configuration for Static HTML Cloaking ───
# Paste this inside your Nginx server config block.
# Detects search crawlers and routes them to index.php (PHP handler),
# while serving static files directly to humans.

# Detect search + AI (GEO) bots
map $http_user_agent $is_bot {
    default 0;
    "~*googlebot" 1;
    "~*bingbot" 1;
    "~*yandex" 1;
    "~*mail.ru" 1;
    # AI answer/search crawlers (drive GEO traffic) — the "good" bots
    "~*oai-searchbot" 1;
    "~*chatgpt-user" 1;
    "~*perplexity" 1;
    "~*claudebot" 1;
    "~*claude-user" 1;
    "~*google-extended" 1;
    # AI training-only crawlers (GPTBot, CCBot, Bytespider, Meta, Applebot-Extended…) are
    # intentionally NOT listed — they get the static/human path, not the doorway.
}

server {
    listen 80;
    server_name ${selectedDomain?.domain || "your-doorway-domain.com"};
    root /var/www/html;
    index index.html;

    location / {
        # If it is a bot, rewrite request to the indexer handler (index.php)
        if ($is_bot) {
            rewrite ^(.*)$ /index.php last;
        }
        
        # For humans, serve static files directly
        try_files $uri $uri/ =404;
    }

    # Process bots via index.php (PHP-FPM handler)
    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock; # Adjust your PHP-FPM socket path
    }
}`;

  const getSelectedCode = () => {
    switch (integrationType) {
      case "phpStatic":
        return phpStaticWrapperContent;
      case "astro":
        return astroMiddlewareContent;
      case "nginx":
        return nginxConfigContent;
      case "php":
      default:
        return phpScriptContent;
    }
  };

  const getSelectedFilename = () => {
    switch (integrationType) {
      case "php":
      case "phpStatic":
        return "index.php";
      case "astro":
        return "src/middleware.ts";
      case "nginx":
        return "nginx.conf";
      default:
        return "script";
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(getSelectedCode());
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
        display: "grid",
        gridTemplateColumns: isLarge ? "1fr 1fr" : "1fr",
        gap: "20px",
      }}>
        {/* Public Endpoint URL */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>
            {t("settPublicUrlLabel")}
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
            {t("settPublicUrlDesc")}
          </span>
        </div>

        {/* Selected Domain */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>
            {t("settSelectDomainLabel")}
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
              <option>{t("settLoadingDomains")}</option>
            ) : domains.length === 0 ? (
              <option>{t("settNoDomainsYet")}</option>
            ) : (
              domains.map(d => (
                <option key={d.id} value={d.id}>{d.domain}</option>
              ))
            )}
          </select>
          <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
            {t("settPreFillDesc")}
          </span>
        </div>

        {/* Integration Type Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: isLarge ? "span 2" : "auto" }}>
          <label style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>
            {t("settIntegrationLabel")}
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "4px" }}>
            {[
              { id: "php", label: t("settOptPhp") },
              { id: "phpStatic", label: t("settOptPhpStatic") },
              { id: "astro", label: t("settOptAstro") },
              { id: "nginx", label: t("settOptNginx") }
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => setIntegrationType(opt.id as any)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--color-border)",
                  background: integrationType === opt.id ? "rgba(41,151,255,0.08)" : "transparent",
                  borderColor: integrationType === opt.id ? "var(--color-accent-blue)" : "var(--color-border)",
                  color: integrationType === opt.id ? "var(--color-accent-blue)" : "var(--color-text-secondary)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s"
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
              {integrationType === "php" || integrationType === "phpStatic" 
                ? t("settScriptTitle") 
                : integrationType === "astro" 
                  ? "Astro Middleware (src/middleware.ts)" 
                  : "Nginx Configuration (nginx.conf)"}
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
            {copied ? t("settCopied") : t("settCopyCode")}
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
            {t("settNoDomainsWarning")}
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
              {getSelectedCode()}
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
            <strong>{t("settCloakingTitle")}</strong> {t("settCloakingDesc")}
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
