#!/usr/bin/env ruby
# frozen_string_literal: true

# Temporary UAT-only Helm post-renderer.
#
# The shared SOBA chart normally creates <release>-formio. This bridge removes
# that generated Secret and redirects references to a separately managed UAT
# runtime Secret. It deliberately never reads the runtime Secret, preventing
# its credentials from entering Helm release metadata.

require 'yaml'

source_secret = ENV.fetch('FORMIO_HELM_SECRET')
runtime_secret = ENV.fetch('FORMIO_RUNTIME_SECRET')

def replace_secret_refs(value, source_secret, runtime_secret)
  case value
  when Hash
    value.each do |key, child|
      if key == 'secretRef' && child.is_a?(Hash) && child['name'] == source_secret
        child['name'] = runtime_secret
      else
        value[key] = replace_secret_refs(child, source_secret, runtime_secret)
      end
    end
  when Array
    value.map! do |child|
      replace_secret_refs(child, source_secret, runtime_secret)
    end
  else
    value
  end
end

YAML.load_stream($stdin.read).each do |document|
  next if document.nil?
  next if document['kind'] == 'Secret' && document.dig('metadata', 'name') == source_secret

  puts YAML.dump(replace_secret_refs(document, source_secret, runtime_secret))
end
