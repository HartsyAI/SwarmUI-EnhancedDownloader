using Newtonsoft.Json.Linq;

namespace Hartsy.Extensions;

/// <summary>Curated list of models from the SwarmUI docs with all download URLs.</summary>
public static class FeaturedModels
{
    public static readonly Lazy<JObject> Cached = new(() => new JObject
    {
        ["success"] = true,
        ["models"] = BuildModelList()
    });

    /// <summary>Returns the cached featured models list, building it on first access.</summary>
    public static JObject GetFeatured()
    {
        return Cached.Value;
    }

    /// <summary>Creates a featured model entry with metadata and download variants.</summary>
    public static JObject M(string name, string category, string note, string architecture, string author, string scale, bool recommended, params JObject[] downloads)
    {
        return new JObject
        {
            ["name"] = name,
            ["category"] = category,
            ["note"] = note,
            ["architecture"] = architecture,
            ["author"] = author,
            ["scale"] = scale,
            ["isRecommended"] = recommended,
            ["downloads"] = new JArray(downloads)
        };
    }

    /// <summary>Creates a download variant entry with a label and URL.</summary>
    public static JObject D(string label, string url)
    {
        return new JObject { ["label"] = label, ["url"] = url };
    }

    /// <summary>Builds the complete list of featured image and video models with all download variants.</summary>
    public static JArray BuildModelList()
    {
        return
        [
            #region Image Models

            M("Z-Image", "image",
                "Best for photoreal. Lightweight 6B with a fast Turbo variant.",
                "S3-DiT", "Tongyi MAI (Alibaba)", "6B", true,
                D("Turbo FP8 (Recommended)", "https://huggingface.co/mcmonkey/swarm-models/blob/main/SwarmUI_Z-Image-Turbo-FP8Mix.safetensors"),
                D("Turbo BF16", "https://huggingface.co/Comfy-Org/z_image_turbo/blob/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors"),
                D("Turbo GGUF Q6_K", "https://huggingface.co/jayn7/Z-Image-Turbo-GGUF/blob/main/z_image_turbo-Q6_K.gguf"),
                D("Turbo GGUF Q4_K_S", "https://huggingface.co/jayn7/Z-Image-Turbo-GGUF/blob/main/z_image_turbo-Q4_K_S.gguf"),
                D("Base BF16", "https://huggingface.co/Comfy-Org/z_image/blob/main/split_files/diffusion_models/z_image_bf16.safetensors")
            ),

            M("Flux.2 Klein", "image",
                "Great for editing and art variety. Smaller, faster Flux.2 variant. 4B is often smarter than 9B.",
                "MMDiT", "Black Forest Labs", "4B, 9B", true,
                D("Klein 4B Distilled", "https://huggingface.co/Comfy-Org/flux2-klein-4B/blob/main/split_files/diffusion_models/flux-2-klein-4b.safetensors"),
                D("Klein 4B Base", "https://huggingface.co/Comfy-Org/flux2-klein-4B/blob/main/split_files/diffusion_models/flux-2-klein-base-4b.safetensors"),
                D("Klein 4B GGUF Q4", "https://huggingface.co/unsloth/FLUX.2-klein-4B-GGUF/blob/main/flux-2-klein-4b-Q4_K_M.gguf"),
                D("Klein 4B Base GGUF Q4", "https://huggingface.co/unsloth/FLUX.2-klein-base-4B-GGUF/blob/main/flux-2-klein-base-4b-Q4_K_M.gguf"),
                D("Klein 9B", "https://huggingface.co/black-forest-labs/FLUX.2-klein-9B/blob/main/flux-2-klein-9b.safetensors"),
                D("Klein 9B GGUF Q4", "https://huggingface.co/unsloth/FLUX.2-klein-9B-GGUF/blob/main/flux-2-klein-9b-Q4_K_M.gguf"),
                D("Klein 9B Base FP8", "https://huggingface.co/black-forest-labs/FLUX.2-klein-base-9b-fp8/blob/main/flux-2-klein-base-9b-fp8.safetensors"),
                D("Klein 9B Base GGUF Q4", "https://huggingface.co/unsloth/FLUX.2-klein-base-9B-GGUF/blob/main/flux-2-klein-base-9b-Q4_K_M.gguf")
            ),

            M("Flux.2 Dev", "image",
                "Smartest image model available. Massive 32B, needs 64GB+ RAM.",
                "MMDiT", "Black Forest Labs", "32B", true,
                D("Dev FP8 (Recommended)", "https://huggingface.co/silveroxides/FLUX.2-dev-fp8_scaled/blob/main/flux2-dev-fp8mixedfromscaled.safetensors"),
                D("Dev Turbo FP8", "https://huggingface.co/silveroxides/FLUX.2-dev-fp8_scaled/blob/main/flux2-dev-turbo-fp8mixed.safetensors"),
                D("Turbo LoRA", "https://huggingface.co/fal/FLUX.2-dev-Turbo/blob/main/comfy/Flux_2-Turbo-LoRA_comfyui.safetensors")
            ),

            M("Qwen Image", "image",
                "Great quality, very memory intense (30GB+ RAM). Slow but smart.",
                "MMDiT", "Alibaba-Qwen", "20B", false,
                D("FP8 2512 (Recommended)", "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/blob/main/split_files/diffusion_models/qwen_image_2512_fp8_e4m3fn.safetensors"),
                D("BF16 2512", "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/blob/main/split_files/diffusion_models/qwen_image_2512_bf16.safetensors"),
                D("Nunchaku int4 (RTX 30/40xx)", "https://huggingface.co/nunchaku-tech/nunchaku-qwen-image/blob/main/svdq-int4_r32-qwen-image.safetensors"),
                D("Nunchaku fp4 (RTX 50xx)", "https://huggingface.co/nunchaku-tech/nunchaku-qwen-image/blob/main/svdq-fp4_r32-qwen-image.safetensors"),
                D("GGUF Q6_K", "https://huggingface.co/city96/Qwen-Image-gguf/blob/main/qwen-image-Q6_K.gguf"),
                D("GGUF Q4_K_S", "https://huggingface.co/city96/Qwen-Image-gguf/blob/main/qwen-image-Q4_K_S.gguf"),
                D("Distilled FP8", "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/blob/main/non_official/diffusion_models/qwen_image_distill_full_fp8_e4m3fn.safetensors")
            ),

            M("Hunyuan Image 2.1", "image",
                "Great quality, very memory intense. Targets 2048x2048. Refiner recommended.",
                "MMDiT", "Tencent", "17B", false,
                D("Original BF16", "https://huggingface.co/tencent/HunyuanImage-2.1/blob/main/dit/hunyuanimage2.1.safetensors"),
                D("Distilled BF16", "https://huggingface.co/Comfy-Org/HunyuanImage_2.1_ComfyUI/blob/main/split_files/diffusion_models/hunyuanimage2.1_distilled_bf16.safetensors"),
                D("Refiner", "https://huggingface.co/tencent/HunyuanImage-2.1/blob/main/dit/hunyuanimage-refiner.safetensors")
            ),

            M("Krea 2", "image",
                "Extremely smart and great quality. Has built-in censorship that strips NSFW terms.",
                "DiT", "Krea AI", "12B", false,
                D("Turbo FP8 (Recommended)", "https://huggingface.co/Comfy-Org/Krea-2/blob/main/diffusion_models/krea2_turbo_fp8_scaled.safetensors"),
                D("Turbo NVFP4 (Weak GPUs)", "https://huggingface.co/Comfy-Org/Krea-2/blob/main/diffusion_models/krea2_turbo_nvfp4.safetensors"),
                D("Turbo BF16", "https://huggingface.co/Comfy-Org/Krea-2/blob/main/diffusion_models/krea2_turbo_bf16.safetensors"),
                D("Raw (Base) FP8", "https://huggingface.co/Comfy-Org/Krea-2/blob/main/diffusion_models/krea2_raw_fp8_scaled.safetensors"),
                D("Raw (Base) BF16", "https://huggingface.co/Comfy-Org/Krea-2/blob/main/diffusion_models/krea2_raw_bf16.safetensors"),
                D("Raw-to-Turbo LoRA", "https://huggingface.co/Comfy-Org/Krea-2/blob/main/loras/krea2_turbo_lora_rank_64_bf16.safetensors")
            ),

            M("Ideogram 4", "image",
                "Advanced input understanding via long-form JSON prompts. Built-in censorship.",
                "DiT", "Ideogram AI", "9B", false,
                D("FP8 (Recommended)", "https://huggingface.co/Comfy-Org/Ideogram-4/blob/main/diffusion_models/ideogram4_fp8_scaled.safetensors"),
                D("NVFP4", "https://huggingface.co/Comfy-Org/Ideogram-4/blob/main/diffusion_models/ideogram4_nvfp4_mixed.safetensors"),
                D("Unconditional FP8 (Negative Model)", "https://huggingface.co/Comfy-Org/Ideogram-4/blob/main/diffusion_models/ideogram4_unconditional_fp8_scaled.safetensors"),
                D("Unconditional NVFP4 (Negative Model)", "https://huggingface.co/Comfy-Org/Ideogram-4/blob/main/diffusion_models/ideogram4_unconditional_nvfp4_mixed.safetensors")
            ),

            M("HiDream O1", "image",
                "Intelligent, fast, decent quality. Designed for LLM-written prompts, targets 2048x2048.",
                "Pixel UiT", "HiDream", "8B", false,
                D("Dev FP8 (Recommended)", "https://huggingface.co/Comfy-Org/HiDream-O1-Image/blob/main/checkpoints/hidream_o1_image_dev_fp8_scaled.safetensors"),
                D("Dev BF16", "https://huggingface.co/Comfy-Org/HiDream-O1-Image/blob/main/checkpoints/hidream_o1_image_dev_bf16.safetensors"),
                D("Base FP8", "https://huggingface.co/Comfy-Org/HiDream-O1-Image/blob/main/checkpoints/hidream_o1_image_fp8_scaled.safetensors"),
                D("Base BF16", "https://huggingface.co/Comfy-Org/HiDream-O1-Image/blob/main/checkpoints/hidream_o1_image_bf16.safetensors"),
                D("Dev LoRA (for Base model)", "https://huggingface.co/Kijai/hidream-O1-image_comfy/blob/main/loras/hidream_o1_dev_lora_rank_64_bf16_pruned_v1.safetensors")
            ),

            M("ERNIE", "image",
                "Intelligent, good quality, fast. Strong base plus a very fast Turbo variant.",
                "DiT", "Baidu", "8B", false,
                D("Turbo BF16", "https://huggingface.co/Comfy-Org/ERNIE-Image/blob/main/diffusion_models/ernie-image-turbo.safetensors"),
                D("Base BF16", "https://huggingface.co/Comfy-Org/ERNIE-Image/blob/main/diffusion_models/ernie-image.safetensors")
            ),

            M("Lens", "image",
                "Lightweight 4B model with a fast Turbo variant. Eh quality but cheap to run.",
                "MMDiT", "Microsoft", "4B", false,
                D("Turbo FP8 (Recommended)", "https://huggingface.co/Comfy-Org/Lens/blob/main/diffusion_models/lens_turbo_mxfp8.safetensors"),
                D("Base FP8", "https://huggingface.co/Comfy-Org/Lens/blob/main/diffusion_models/lens_mxfp8.safetensors"),
                D("Turbo BF16", "https://huggingface.co/Comfy-Org/Lens/blob/main/diffusion_models/lens_turbo_bf16.safetensors"),
                D("Base BF16", "https://huggingface.co/Comfy-Org/Lens/blob/main/diffusion_models/lens_bf16.safetensors")
            ),

            M("Flux.1", "image",
                "High quality, large ecosystem of finetunes and LoRAs. Outdated but still very popular.",
                "MMDiT", "Black Forest Labs", "12B", false,
                D("Dev Nunchaku int4 (RTX 30/40xx)", "https://huggingface.co/mit-han-lab/nunchaku-flux.1-dev/blob/main/svdq-int4_r32-flux.1-dev.safetensors"),
                D("Dev Nunchaku fp4 (RTX 50xx)", "https://huggingface.co/mit-han-lab/nunchaku-flux.1-dev/blob/main/svdq-fp4_r32-flux.1-dev.safetensors"),
                D("Schnell Nunchaku int4 (RTX 30/40xx)", "https://huggingface.co/mit-han-lab/nunchaku-flux.1-schnell/blob/main/svdq-int4_r32-flux.1-schnell.safetensors"),
                D("Schnell Nunchaku fp4 (RTX 50xx)", "https://huggingface.co/mit-han-lab/nunchaku-flux.1-schnell/blob/main/svdq-fp4_r32-flux.1-schnell.safetensors"),
                D("Dev GGUF Q6_K", "https://huggingface.co/city96/FLUX.1-dev-gguf/blob/main/flux1-dev-Q6_K.gguf"),
                D("Dev GGUF Q4_K_S", "https://huggingface.co/city96/FLUX.1-dev-gguf/blob/main/flux1-dev-Q4_K_S.gguf"),
                D("Schnell GGUF Q6_K", "https://huggingface.co/city96/FLUX.1-schnell-gguf/blob/main/flux1-schnell-Q6_K.gguf"),
                D("Schnell GGUF Q4_K_S", "https://huggingface.co/city96/FLUX.1-schnell-gguf/blob/main/flux1-schnell-Q4_K_S.gguf"),
                D("Dev FP8", "https://huggingface.co/Comfy-Org/flux1-dev/blob/main/flux1-dev-fp8.safetensors"),
                D("Schnell FP8", "https://huggingface.co/Comfy-Org/flux1-schnell/blob/main/flux1-schnell-fp8.safetensors")
            ),

            M("Chroma", "image",
                "Flux derivative, uncensored. Decent quality, works best with long prompts.",
                "MMDiT", "Lodestone Rock", "8.9B", false,
                D("HD FP8 Scaled", "https://huggingface.co/silveroxides/Chroma1-HD-fp8-scaled/blob/main/Chroma1-HD-fp8mixed-final.safetensors"),
                D("GGUF Q8_0", "https://huggingface.co/silveroxides/Chroma-GGUF/blob/main/Chroma1-HD/Chroma1-HD-Q8_0.gguf"),
                D("GGUF Q4_0", "https://huggingface.co/silveroxides/Chroma-GGUF/blob/main/Chroma1-HD/Chroma1-HD-Q4_0.gguf")
            ),

            M("Chroma Radiance", "image",
                "Pixel-space Flux derivative, uncensored. Work in progress, expect limited quality. No VAE.",
                "Pixel MMDiT", "Lodestone Rock", "8.9B", false,
                D("Full 20M Dataset (1024)", "https://huggingface.co/lodestones/Chroma1-Radiance/blob/main/latest_x0_full_20M_dataset_run_1024.safetensors"),
                D("Full 20M Dataset", "https://huggingface.co/lodestones/Chroma1-Radiance/blob/main/latest_x0_full_20M_dataset_run.safetensors"),
                D("Latest x0", "https://huggingface.co/lodestones/Chroma1-Radiance/blob/main/latest_x0.safetensors")
            ),

            M("Kandinsky 5 Image", "image",
                "Decent quality, modern DiT architecture.",
                "DiT", "Kandinsky Lab", "6B", false,
                D("Image Lite (Collection)", "https://huggingface.co/collections/kandinskylab/kandinsky-50-image-lite")
            ),

            M("Anima", "image",
                "Very small 2B anime model on Cosmos architecture. Preview status.",
                "DiT", "Circlestone Labs", "2B", false,
                D("Preview", "https://huggingface.co/circlestone-labs/Anima/blob/main/split_files/diffusion_models/anima-preview.safetensors")
            ),

            M("Lumina 2.0", "image",
                "Small 2.6B model, passable quality. Requires LLM-style prompt prefixes.",
                "NextDiT", "Alpha-VLLM", "2.6B", false,
                D("All-in-one", "https://huggingface.co/Comfy-Org/Lumina_Image_2.0_Repackaged/blob/main/all_in_one/lumina_2.safetensors"),
                D("Diffusion Model BF16", "https://huggingface.co/Comfy-Org/Lumina_Image_2.0_Repackaged/blob/main/split_files/diffusion_models/lumina_2_model_bf16.safetensors")
            ),

            M("SD 3.5 Large", "image",
                "Outdated but decent for its time. 8B MMDiT from Stability AI.",
                "MMDiT", "Stability AI", "8B", false,
                D("GGUF Q8_0", "https://huggingface.co/city96/stable-diffusion-3.5-large-gguf/blob/main/sd3.5_large-Q8_0.gguf"),
                D("GGUF Q4_0", "https://huggingface.co/city96/stable-diffusion-3.5-large-gguf/blob/main/sd3.5_large-Q4_0.gguf"),
                D("Turbo GGUF Q8_0", "https://huggingface.co/city96/stable-diffusion-3.5-large-turbo-gguf/blob/main/sd3.5_large_turbo-Q8_0.gguf"),
                D("Turbo GGUF Q4_0", "https://huggingface.co/city96/stable-diffusion-3.5-large-turbo-gguf/blob/main/sd3.5_large_turbo-Q4_0.gguf")
            ),

            M("SD 3.5 Medium", "image",
                "Outdated, lightweight 2B. Set resolution to 1024x1024 for best results.",
                "MMDiT", "Stability AI", "2B", false,
                D("GGUF Q8_0", "https://huggingface.co/city96/stable-diffusion-3.5-medium-gguf/blob/main/sd3.5_medium-Q8_0.gguf"),
                D("GGUF Q4_K_S", "https://huggingface.co/city96/stable-diffusion-3.5-medium-gguf/blob/main/sd3.5_medium-Q4_K_S.gguf")
            ),

            M("AuraFlow", "image",
                "Outdated, but regained attention via Pony v7 finetune.",
                "MMDiT", "Fal.AI", "6B", false,
                D("v0.2", "https://huggingface.co/fal/AuraFlow-v0.2/blob/main/auraflow_v0.2.safetensors")
            ),

            #endregion

            #region Video Models

            M("Wan 2.1", "video",
                "Best local video model. 14B for quality, 1.3B for speed. CausVid/Lightx2v LoRAs available for faster gen.",
                "DiT", "Alibaba - Wan-AI", "1.3B, 14B", true,
                D("T2V 14B FP8 (Recommended)", "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/blob/main/split_files/diffusion_models/wan2.1_t2v_14B_fp8_scaled.safetensors"),
                D("T2V 1.3B FP16", "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/blob/main/split_files/diffusion_models/wan2.1_t2v_1.3B_fp16.safetensors"),
                D("I2V 480p 14B FP8", "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/blob/main/split_files/diffusion_models/wan2.1_i2v_480p_14B_fp8_scaled.safetensors"),
                D("I2V 720p 14B FP8", "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/blob/main/split_files/diffusion_models/wan2.1_i2v_720p_14B_fp8_scaled.safetensors"),
                D("I2V 1.3B Fun-InP", "https://huggingface.co/alibaba-pai/Wan2.1-Fun-1.3B-InP/blob/main/diffusion_pytorch_model.safetensors"),
                D("FLF2V 14B 720p FP8", "https://huggingface.co/Kijai/WanVideo_comfy/blob/main/Wan2_1-FLF2V-14B-720P_fp8_e4m3fn.safetensors"),
                D("Lightx2v LoRA (Fast 14B)", "https://huggingface.co/Kijai/WanVideo_comfy/blob/main/Wan21_T2V_14B_lightx2v_cfg_step_distill_lora_rank32.safetensors"),
                D("CausVid LoRA v2 (Fast 14B)", "https://huggingface.co/Kijai/WanVideo_comfy/blob/main/Wan21_CausVid_14B_T2V_lora_rank32_v2.safetensors"),
                D("Phantom 14B FP8", "https://huggingface.co/Kijai/WanVideo_comfy/blob/main/Phantom-Wan-14B_fp8_e4m3fn.safetensors"),
                D("Phantom 14B GGUF Q4", "https://huggingface.co/QuantStack/Phantom_Wan_14B-GGUF/blob/main/Phantom_Wan_14B-Q4_K_M.gguf")
            ),

            M("Wan 2.2", "video",
                "Better photorealism than 2.1 but more complex (high+low noise pair for 14B). 5B variant is simpler.",
                "DiT", "Alibaba - Wan-AI", "5B, 14B", true,
                D("T2V 14B High Noise FP8", "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/blob/main/split_files/diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors"),
                D("T2V 14B Low Noise FP8", "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/blob/main/split_files/diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors"),
                D("I2V 14B High Noise FP8", "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/blob/main/split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"),
                D("I2V 14B Low Noise FP8", "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/blob/main/split_files/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors"),
                D("5B TI2V FP16", "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/blob/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors")
            ),

            M("Kandinsky 5 Video", "video",
                "New and interesting. 19B Pro for quality, 2B Lite for speed. Still maturing.",
                "DiT", "Kandinsky Lab", "2B, 19B", false,
                D("Video Lite (Collection)", "https://huggingface.co/collections/kandinskylab/kandinsky-50-video-lite"),
                D("Video Pro (Collection)", "https://huggingface.co/collections/kandinskylab/kandinsky-50-video-pro")
            ),

            M("Hunyuan Video", "video",
                "Decent quality T2V and I2V. GPU and memory intensive (12B).",
                "MMDiT", "Tencent", "12B", false,
                D("T2V BF16", "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/blob/main/split_files/diffusion_models/hunyuan_video_t2v_720p_bf16.safetensors"),
                D("I2V BF16", "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/blob/main/split_files/diffusion_models/hunyuan_video_image_to_video_720p_bf16.safetensors"),
                D("GGUF Q6_K", "https://huggingface.co/city96/HunyuanVideo-gguf/blob/main/hunyuan-video-t2v-720p-Q6_K.gguf"),
                D("GGUF Q4_K_M", "https://huggingface.co/city96/HunyuanVideo-gguf/blob/main/hunyuan-video-t2v-720p-Q4_K_M.gguf"),
                D("FastVideo FP8", "https://huggingface.co/Kijai/HunyuanVideo_comfy/blob/main/hunyuan_video_FastVideo_720_fp8_e4m3fn.safetensors")
            ),

            M("Hunyuan Video 1.5", "video",
                "Faster than v1 thanks to 16x16 VAE. T2V, I2V, and SuperResolution variants.",
                "MMDiT", "Tencent", "8B", false,
                D("T2V 720p Distilled", "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/blob/main/split_files/diffusion_models/hunyuan_video_1.5_t2v_720p_distilled_bf16.safetensors"),
                D("I2V 720p Distilled", "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/blob/main/split_files/diffusion_models/hunyuan_video_1.5_i2v_720p_distilled_bf16.safetensors")
            ),

            M("LTX Video", "video",
                "Very fast but lower quality. Popular for Image2Video workflows.",
                "DiT", "Lightricks", "3B", false,
                D("v0.9.1", "https://huggingface.co/Lightricks/LTX-Video/blob/main/ltx-video-2b-v0.9.1.safetensors")
            ),

            M("LTX Video 2", "video",
                "First open source Audio+Video model. Mixed quality but fun. 2.3 is the newer upgrade.",
                "DiT", "Lightricks", "19B, 22B", false,
                D("2.3 Dev FP8", "https://huggingface.co/Lightricks/LTX-2.3-fp8/blob/main/ltx-2.3-22b-dev-fp8.safetensors"),
                D("2.3 Distilled FP8", "https://huggingface.co/Lightricks/LTX-2.3-fp8/blob/main/ltx-2.3-22b-distilled-fp8.safetensors"),
                D("2.3 Dev BF16", "https://huggingface.co/Lightricks/LTX-2.3/blob/main/ltx-2.3-22b-dev.safetensors"),
                D("2.3 Distilled BF16", "https://huggingface.co/Lightricks/LTX-2.3/blob/main/ltx-2.3-22b-distilled.safetensors"),
                D("2.3 Distilled Refiner LoRA", "https://huggingface.co/Lightricks/LTX-2.3/blob/main/ltx-2.3-22b-distilled-lora-384.safetensors"),
                D("2 Dev FP8", "https://huggingface.co/Lightricks/LTX-2/blob/main/ltx-2-19b-dev-fp8.safetensors"),
                D("2 Dev FP4", "https://huggingface.co/Lightricks/LTX-2/blob/main/ltx-2-19b-dev-fp4.safetensors"),
                D("2 Dev BF16", "https://huggingface.co/Lightricks/LTX-2/blob/main/ltx-2-19b-dev.safetensors"),
                D("2 Distilled FP8", "https://huggingface.co/Lightricks/LTX-2/blob/main/ltx-2-19b-distilled-fp8.safetensors"),
                D("2 Distilled BF16", "https://huggingface.co/Lightricks/LTX-2/blob/main/ltx-2-19b-distilled.safetensors")
            ),

            #endregion

            #region Audio Models

            M("Ace Step 1.5", "audio",
                "First natively-supported audio model. Music generation with lyrics and style prompts. Fast.",
                "DiT", "StepFun", "2B", true,
                D("Turbo", "https://huggingface.co/Comfy-Org/ace_step_1.5_ComfyUI_files/blob/main/split_files/diffusion_models/acestep_v1.5_turbo.safetensors")
            ),

            #endregion
        ];
    }
}
