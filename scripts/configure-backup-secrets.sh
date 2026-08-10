#!/bin/sh
set -eu
umask 077

env_file="${1:-.env}"

if [ ! -f "$env_file" ]; then
  printf 'Environment file not found: %s\n' "$env_file" >&2
  exit 1
fi

restore_terminal() {
  stty echo 2>/dev/null || true
}

read_required() {
  prompt="$1"
  variable_name="$2"
  hidden="${3:-false}"

  printf '%s: ' "$prompt" >&2
  if [ "$hidden" = "true" ]; then
    stty -echo
  fi
  IFS= read -r value
  if [ "$hidden" = "true" ]; then
    stty echo
    printf '\n' >&2
  fi

  if [ -z "$value" ]; then
    printf '%s cannot be empty.\n' "$prompt" >&2
    exit 1
  fi
  case "$value" in
    *'
'*|*"$(printf '\r')"*)
      printf '%s must be a single line.\n' "$prompt" >&2
      exit 1
      ;;
  esac

  case "$variable_name" in
    r2_access_key_id) r2_access_key_id="$value" ;;
    r2_secret_access_key) r2_secret_access_key="$value" ;;
    smtp_url) smtp_url="$value" ;;
    smtp_username) smtp_username="$value" ;;
    smtp_password) smtp_password="$value" ;;
    smtp_from) smtp_from="$value" ;;
    smtp_to) smtp_to="$value" ;;
    *)
      printf 'Unknown configuration field: %s\n' "$variable_name" >&2
      exit 1
      ;;
  esac
}

dotenv_value() {
  printf '%s' "$1" | sed "s/'/'\\\\''/g"
}

trap restore_terminal EXIT INT TERM

read_required "R2 Access Key ID" r2_access_key_id
read_required "R2 Secret Access Key" r2_secret_access_key true

printf 'Configure SMTP email alerts now? [y/N]: ' >&2
IFS= read -r configure_email
case "$configure_email" in
  y|Y|yes|YES)
    read_required "SMTP URL (for Gmail: smtps://smtp.gmail.com:465)" smtp_url
    read_required "SMTP username" smtp_username
    read_required "SMTP app password" smtp_password true
    read_required "SMTP From address" smtp_from
    read_required "SMTP To address" smtp_to
    ;;
  *)
    configure_email="no"
    ;;
esac

temporary_file="$(mktemp "${env_file}.XXXXXX")"
trap 'restore_terminal; rm -f "$temporary_file"' EXIT INT TERM

awk '!/^(R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|SMTP_URL|SMTP_USERNAME|SMTP_PASSWORD|SMTP_FROM|SMTP_TO)=/' \
  "$env_file" > "$temporary_file"

{
  printf "R2_ACCESS_KEY_ID='%s'\n" "$(dotenv_value "$r2_access_key_id")"
  printf "R2_SECRET_ACCESS_KEY='%s'\n" "$(dotenv_value "$r2_secret_access_key")"
  if [ "$configure_email" != "no" ]; then
    printf "SMTP_URL='%s'\n" "$(dotenv_value "$smtp_url")"
    printf "SMTP_USERNAME='%s'\n" "$(dotenv_value "$smtp_username")"
    printf "SMTP_PASSWORD='%s'\n" "$(dotenv_value "$smtp_password")"
    printf "SMTP_FROM='%s'\n" "$(dotenv_value "$smtp_from")"
    printf "SMTP_TO='%s'\n" "$(dotenv_value "$smtp_to")"
  fi
} >> "$temporary_file"

chmod 600 "$temporary_file"
mv "$temporary_file" "$env_file"
trap restore_terminal EXIT INT TERM

unset r2_access_key_id r2_secret_access_key smtp_url smtp_username
unset smtp_password smtp_from smtp_to configure_email value

printf 'Backup credentials saved to %s.\n' "$env_file"
