#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^ECMediaRemoteSnapshotHandler)(NSDictionary<NSString *, id> * _Nullable info,
                                              NSNumber * _Nullable processIdentifier,
                                              NSNumber * _Nullable isPlaying);
typedef void (^ECMediaRemoteChangeHandler)(void);

@interface ECMediaRemoteBridge : NSObject
+ (BOOL)isAvailable;
+ (void)fetchNowPlaying:(ECMediaRemoteSnapshotHandler)handler;
+ (BOOL)startObservingChanges:(ECMediaRemoteChangeHandler)handler;
+ (void)stopObservingChanges;
@end

NS_ASSUME_NONNULL_END
