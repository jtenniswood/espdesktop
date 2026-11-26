#pragma once

#ifdef USE_WEBSERVER

// Preview a draft using the same placement functions as the display. The draft
// is local to the HTTP request and never reaches the configuration service.
class LiveSubpagePreviewHandler final : public esphome::web_server_idf::AsyncWebHandler {
 public:
  bool canHandle(esphome::web_server_idf::AsyncWebServerRequest *request) const override {
    char path[esphome::web_server_idf::AsyncWebServerRequest::URL_BUF_SIZE];
    return request->method() == HTTP_POST && request->url_to(path) == "/companion/page-preview";
  }

  size_t maximumBodySize() const override { return 8192; }

  bool canReceiveBody(esphome::web_server_idf::AsyncWebServerRequest *request) override {
    body_.clear();
    return companion_authorize_web_request(request);
  }

  void handleBody(esphome::web_server_idf::AsyncWebServerRequest *, uint8_t *data,
                  size_t len, size_t index, size_t total) override {
    if (data == nullptr || index != body_.size() || total > maximumBodySize() ||
        len > maximumBodySize() - body_.size()) return;
    body_.insert(body_.end(), data, data + len);
  }

  void handleRequest(esphome::web_server_idf::AsyncWebServerRequest *request) override {
    if (!companion_authorize_web_request(request)) return;
    std::string response;
    const auto content_type = request->get_header("Content-Type");
    const bool parsed = content_type && *content_type == "application/json" &&
      esphome::json::parse_json(body_.data(), body_.size(), [&](JsonObject root) {
        return this->project(root, response);
      });
    body_.clear();
    httpd_req_t *raw = *request;
    if (!parsed) {
      httpd_resp_send_err(raw, HTTPD_400_BAD_REQUEST, "Invalid live subpage preview");
      return;
    }
    if (response.empty()) {
      httpd_resp_set_status(raw, "503 Service Unavailable");
      httpd_resp_send(raw, "", 0);
      return;
    }
    httpd_resp_set_type(raw, "application/json");
    httpd_resp_set_hdr(raw, "Cache-Control", "no-store");
    httpd_resp_send(raw, response.c_str(), response.size());
  }

 private:
  bool project(JsonObjectConst root, std::string &response) {
    if (!root["kind"].is<const char *>() || !root["order"].is<const char *>() ||
        !root["options"].is<const char *>() || !root["entities"].is<JsonArrayConst>() ||
        !root["columns"].is<int>() || !root["slots"].is<int>() || !root["capacity"].is<int>()) return false;
    const std::string kind = root["kind"].as<const char *>();
    const bool finder = kind == "finder";
    const auto obs_kind = obs_subpage_kind(kind);
    if (!finder && obs_kind == OBSSubpageKind::none) return false;
    const int columns = root["columns"].as<int>();
    const int slots = root["slots"].as<int>();
    const int capacity = root["capacity"].as<int>();
    const JsonArrayConst entities = root["entities"].as<JsonArrayConst>();
    if (columns < 1 || columns > slots || slots > capacity || capacity > MAX_GRID_SLOTS ||
        entities.size() > static_cast<size_t>(capacity)) return false;
    std::vector<SubpageBtn> buttons;
    for (const JsonVariantConst entity : entities) {
      if (!entity.is<const char *>()) return false;
      SubpageBtn card{};
      card.entity = entity.as<const char *>();
      buttons.push_back(std::move(card));
    }
    const int saved = buttons.size();
    const std::string options = root["options"].as<const char *>();
    SubpageOrder order;
    parse_subpage_order(root["order"].as<const char *>(), slots, saved, order, capacity);
    normalize_subpage_order_spans(order, slots, columns);

    const auto snapshot = companion_runtime_snapshot();
    if (finder) {
      CompanionActionList folders;
      if (snapshot.connected) {
        for (const auto &action : snapshot.actions)
          if (is_live_finder_folder(action.id)) folders.push_back(action);
      }
      finder_project_folder_tiles(order, buttons, slots, columns, capacity, folders,
        cfg_option_value(options, "finder_open_behavior"), cfg_option_value(options, "generated_card_exclusions"));
    } else {
      const char *ready = obs_kind == OBSSubpageKind::sources ? "obs.sources" : "obs.status.program";
      if (!companion_published_action(snapshot, ready)) return true;
      project_obs_subpage_tiles(order, buttons, slots, columns, capacity,
        obs_subpage_catalogue(snapshot, obs_kind), options, obs_kind);
    }

    response = "[";
    for (int position = 0; position < slots; ++position) {
      const int index = order.positions[position];
      if (index <= saved) continue;
      const auto &card = buttons[index - 1];
      if (response.size() > 1) response += ',';
      response += "{\"position\":" + std::to_string(position) +
        ",\"width\":" + std::to_string(order.col_span[index - 1]) +
        ",\"id\":\"" + companion_json_escape(card.entity) +
        "\",\"label\":\"" + companion_json_escape(card.label) + "\"}";
    }
    response += ']';
    return true;
  }

  std::vector<uint8_t> body_;
};

#endif
