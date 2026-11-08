import { normalizeCoverArtDelay } from "../model/settings";
import type { EntityStateFeature } from "./entity_state";
import type { ApplicationApiFeature } from "./api";
export interface ArtworkPostApiFeature {
    postMediaPlayerSleepPrevention(on?: any): any;
    postCoverArtScreensaver(on?: any): any;
    postCoverArtSource(value?: any): any;
    coverArtDelayPostUrls(value?: any): any;
    postCoverArtDelay(value?: any): any;
    coverArtTrackOverlayDurationPostUrls(value?: any): any;
    postCoverArtTrackOverlayDuration(value?: any): any;
}

export function createArtworkPostApiFeature(
    entityState: Pick<EntityStateFeature, "entityName" | "entityObjectIds" | "entityPostUrls">,
    requestApi: Pick<ApplicationApiFeature, "post" | "postTextWithObjectIds" | "postSwitchWithObjectIds" | "postSelectWithObjectIds">,
): ArtworkPostApiFeature {
    const { entityName, entityObjectIds, entityPostUrls } = entityState;
    const { post, postTextWithObjectIds, postSwitchWithObjectIds, postSelectWithObjectIds } = requestApi;
    // ── Artwork Post API ──────────────────────────────────────────────────
    function postMediaPlayerSleepPrevention(this: any, on?: any) {
        return postSwitchWithObjectIds(entityName("screen_saver_media_player_sleep_prevention"), entityObjectIds("screen_saver_media_player_sleep_prevention"), on);
    }
    function postCoverArtScreensaver(this: any, on?: any) {
        return postSwitchWithObjectIds(entityName("screen_saver_cover_art"), entityObjectIds("screen_saver_cover_art"), on);
    }
    function postCoverArtSource(this: any, value?: any) {
        const source = "Mac Companion";
        return postSelectWithObjectIds(entityName("cover_art_source"), entityObjectIds("cover_art_source"), source);
    }
    function coverArtDelayPostUrls(this: any, value?: any) {
        return entityPostUrls("number", entityName("screen_saver_cover_art_delay"), entityObjectIds("screen_saver_cover_art_delay"), "set?value=" + encodeURIComponent(normalizeCoverArtDelay(value)));
    }
    function postCoverArtDelay(this: any, value?: any) {
        return post(coverArtDelayPostUrls(value));
    }
    function coverArtTrackOverlayDurationPostUrls(this: any, value?: any) {
        return entityPostUrls("number", entityName("screen_saver_track_overlay_duration"), entityObjectIds("screen_saver_track_overlay_duration"), "set?value=" + encodeURIComponent(value));
    }
    function postCoverArtTrackOverlayDuration(this: any, value?: any) {
        return post(coverArtTrackOverlayDurationPostUrls(value));
    }
    return {
        postMediaPlayerSleepPrevention,
        postCoverArtScreensaver,
        postCoverArtSource,
        coverArtDelayPostUrls,
        postCoverArtDelay,
        coverArtTrackOverlayDurationPostUrls,
        postCoverArtTrackOverlayDuration,
    };
}
