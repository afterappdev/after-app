import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../theme/app_theme.dart';
import '../widgets/expanded_image.dart';

bool isVideoUrl(String? url) {
  final path = Uri.tryParse(url ?? '')?.path.toLowerCase() ?? (url ?? '').toLowerCase();
  return path.endsWith('.mp4') ||
      path.endsWith('.webm') ||
      path.endsWith('.mov') ||
      path.endsWith('.m4v') ||
      path.endsWith('.ogv');
}

bool isVideoMedia(Map<dynamic, dynamic>? item) {
  if (item == null) return false;
  final type = item['mediaType']?.toString().toUpperCase();
  if (type == 'VIDEO') return true;
  if (type == 'IMAGE') return false;
  return isVideoUrl(item['url']?.toString());
}

void openExpandedMedia(
  BuildContext context,
  String url, {
  bool video = false,
}) {
  if (url.isEmpty) return;
  if (video || isVideoUrl(url)) {
    showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.88),
      builder: (dialogContext) => _ExpandedVideo(url: url),
    );
    return;
  }
  openExpandedImage(context, url);
}

class GalleryMediaThumb extends StatelessWidget {
  const GalleryMediaThumb({
    super.key,
    required this.url,
    required this.video,
    this.onTap,
  });

  final String url;
  final bool video;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final image = url.isEmpty
        ? const ColoredBox(color: Color(0xFFEEF3F1))
        : Image.network(
            url,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => const ColoredBox(
              color: Color(0xFF1C1C1E),
              child: Center(
                child: Icon(
                  Icons.videocam_outlined,
                  color: Colors.white70,
                  size: 32,
                ),
              ),
            ),
          );

    return GestureDetector(
      onTap: onTap,
      child: SizedBox.expand(
        child: Stack(
          fit: StackFit.expand,
          children: [
            Positioned.fill(child: image),
            if (video)
              const ColoredBox(
                color: Color(0x33000000),
                child: Center(
                  child: Icon(
                    Icons.play_circle_fill_rounded,
                    color: Colors.white,
                    size: 36,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ExpandedVideo extends StatefulWidget {
  const _ExpandedVideo({required this.url});

  final String url;

  @override
  State<_ExpandedVideo> createState() => _ExpandedVideoState();
}

class _ExpandedVideoState extends State<_ExpandedVideo> {
  VideoPlayerController? _controller;
  bool _ready = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    final controller = VideoPlayerController.networkUrl(Uri.parse(widget.url));
    _controller = controller;
    controller.initialize().then((_) {
      if (!mounted) return;
      controller
        ..setLooping(true)
        ..play();
      setState(() => _ready = true);
    }).catchError((_) {
      if (!mounted) return;
      setState(() => _failed = true);
    });
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: Stack(
          children: [
            Center(
              child: _failed
                  ? const Text(
                      'Não foi possível reproduzir o vídeo.',
                      style: TextStyle(
                        fontFamily: AppTheme.fontFamily,
                        color: Colors.white,
                      ),
                    )
                  : !_ready || controller == null
                      ? const CircularProgressIndicator(color: Colors.white)
                      : GestureDetector(
                          onTap: () {
                            if (controller.value.isPlaying) {
                              controller.pause();
                            } else {
                              controller.play();
                            }
                            setState(() {});
                          },
                          child: AspectRatio(
                            aspectRatio: controller.value.aspectRatio == 0
                                ? 16 / 9
                                : controller.value.aspectRatio,
                            child: Stack(
                              alignment: Alignment.center,
                              children: [
                                VideoPlayer(controller),
                                if (!controller.value.isPlaying)
                                  const Icon(
                                    Icons.play_circle_fill_rounded,
                                    color: Colors.white,
                                    size: 64,
                                  ),
                              ],
                            ),
                          ),
                        ),
            ),
            Positioned(
              top: 8,
              right: 8,
              child: IconButton(
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close, color: Colors.white),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
