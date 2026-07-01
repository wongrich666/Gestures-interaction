export const ffmpegWebmToMp4Command =
  'ffmpeg -i input.webm -c:v libx264 -pix_fmt yuv420p -c:a aac output.mp4'
