using Newtonsoft.Json.Linq;

namespace EnhancedDownloader;

/// <summary>Curated list of models from the SwarmUI docs with all download URLs.</summary>
public static class FeaturedModels
{
    private static JObject _cached;

    public static JObject GetFeatured()
    {
        return _cached ??= new JObject
        {
            ["success"] = true,
            ["models"] = BuildModelList()
        };
    }

    private static JObject M(string name, string category, string note, string architecture, string author, string scale, bool recommended, params JObject[] downloads)
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

    private static JObject D(string label, string url)
    {
        return new JObject { ["label"] = label, ["url"] = url };
    }

    private static JArray BuildModelList()
    {
        return
        [
            // ========================
            // IMAGE MODELS
            // ========================

            // --- Recommended ---
            M("Z-Image", "image",
                "Best for photoreal. Lightweight 6B with a fast Turbo variant.",
                "S3-DiT", "Tongyi MAI (Alibaba)", "6B", true,
                D("Turbo FP8 (Recommended)", "https://huggingface.co/mcmonkey/swarm-models/blob/main/SwarmUI_Z-Image-Turbo-FP8Mix.safetensors"),
                D("Turbo BF16", "https://huggingface.co/Comfy-Org/z_image_turbo/blob/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors"),
                D("Turbo GGUF", "https://huggingface.co/jayn7/Z-Image-Turbo-GGUF/tree/main"),
                D("Base BF16", "https://huggingface.co/Comfy-Org/z_image/blob/main/split_files/diffusion_models/z_image_bf16.safetensors")
            ),

            M("Flux.2 Klein", "image",
                "Great for editing and art variety. Smaller, faster Flux.2 variant. 4B is often smarter than 9B.",
                "MMDiT", "Black Forest Labs", "4B, 9B", true,
                D("Klein 4B Distilled", "https://huggingface.co/Comfy-Org/flux2-klein-4B/tree/main/split_files/diffusion_models"),
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
                D("Dev GGUF", "https://huggingface.co/city96/FLUX.2-dev-gguf/tree/main"),
                D("Dev Turbo FP8", "https://huggingface.co/silveroxides/FLUX.2-dev-fp8_scaled/blob/main/flux2-dev-turbo-fp8mixed.safetensors"),
                D("Turbo LoRA", "https://huggingface.co/fal/FLUX.2-dev-Turbo/blob/main/comfy/Flux_2-Turbo-LoRA_comfyui.safetensors")
            ),

            // --- Modern / Good ---
            M("Qwen Image", "image",
                "Great quality, very memory intense (30GB+ RAM). Slow but smart.",
                "MMDiT", "Alibaba-Qwen", "20B", false,
                D("FP8/BF16 Variants", "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/tree/main/split_files/diffusion_models"),
                D("Nunchaku (Faster)", "https://huggingface.co/nunchaku-tech/nunchaku-qwen-image/tree/main"),
                D("GGUF", "https://huggingface.co/city96/Qwen-Image-gguf/tree/main"),
                D("Distilled FP8", "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/blob/main/non_official/diffusion_models/qwen_image_distill_full_fp8_e4m3fn.safetensors")
            ),

            M("Hunyuan Image 2.1", "image",
                "Great quality, very memory intense. Targets 2048x2048. Refiner recommended.",
                "MMDiT", "Tencent", "17B", false,
                D("Original BF16", "https://huggingface.co/tencent/HunyuanImage-2.1/blob/main/dit/hunyuanimage2.1.safetensors"),
                D("GGUF", "https://huggingface.co/QuantStack/HunyuanImage-2.1-GGUF/tree/main"),
                D("Distilled BF16", "https://huggingface.co/Comfy-Org/HunyuanImage_2.1_ComfyUI/blob/main/split_files/diffusion_models/hunyuanimage2.1_distilled_bf16.safetensors"),
                D("Distilled GGUF", "https://huggingface.co/QuantStack/HunyuanImage-2.1-Distilled-GGUF/tree/main"),
                D("Refiner", "https://huggingface.co/tencent/HunyuanImage-2.1/blob/main/dit/hunyuanimage-refiner.safetensors"),
                D("Refiner GGUF", "https://huggingface.co/QuantStack/HunyuanImage-2.1-Refiner-GGUF/tree/main")
            ),

            M("Flux.1", "image",
                "High quality, large ecosystem of finetunes and LoRAs. Outdated but still very popular.",
                "MMDiT", "Black Forest Labs", "12B", false,
                D("Dev Nunchaku (Fastest)", "https://huggingface.co/mit-han-lab/nunchaku-flux.1-dev/tree/main"),
                D("Schnell Nunchaku", "https://huggingface.co/mit-han-lab/nunchaku-flux.1-schnell/tree/main"),
                D("Dev GGUF", "https://huggingface.co/city96/FLUX.1-dev-gguf/tree/main"),
                D("Schnell GGUF", "https://huggingface.co/city96/FLUX.1-schnell-gguf/tree/main"),
                D("Dev FP8", "https://huggingface.co/Comfy-Org/flux1-dev/blob/main/flux1-dev-fp8.safetensors"),
                D("Schnell FP8", "https://huggingface.co/Comfy-Org/flux1-schnell/blob/main/flux1-schnell-fp8.safetensors")
            ),

            M("Chroma", "image",
                "Flux derivative, uncensored. Decent quality, works best with long prompts.",
                "MMDiT", "Lodestone Rock", "8.9B", false,
                D("HD FP8 Scaled", "https://huggingface.co/silveroxides/Chroma1-HD-fp8-scaled/tree/main"),
                D("FP8 Scaled", "https://huggingface.co/Clybius/Chroma-fp8-scaled/tree/main"),
                D("GGUF", "https://huggingface.co/silveroxides/Chroma-GGUF"),
                D("BF16 Original", "https://huggingface.co/lodestones/Chroma/tree/main")
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

            // --- Older ---
            M("SD 3.5 Large", "image",
                "Outdated but decent for its time. 8B MMDiT from Stability AI.",
                "MMDiT", "Stability AI", "8B", false,
                D("GGUF", "https://huggingface.co/city96/stable-diffusion-3.5-large-gguf/tree/main"),
                D("Turbo GGUF", "https://huggingface.co/city96/stable-diffusion-3.5-large-turbo-gguf/tree/main")
            ),

            M("SD 3.5 Medium", "image",
                "Outdated, lightweight 2B. Set resolution to 1024x1024 for best results.",
                "MMDiT", "Stability AI", "2B", false,
                D("GGUF", "https://huggingface.co/city96/stable-diffusion-3.5-medium-gguf/tree/main")
            ),

            M("AuraFlow", "image",
                "Outdated, but regained attention via Pony v7 finetune.",
                "MMDiT", "Fal.AI", "6B", false,
                D("v0.1", "https://huggingface.co/fal/AuraFlow/tree/main"),
                D("v0.2", "https://huggingface.co/fal/AuraFlow-v0.2")
            ),

            M("Chroma Radiance", "image",
                "Experimental pixel-space model. WIP, limited quality.",
                "Pixel MMDiT", "Lodestone Rock", "8.9B", false,
                D("BF16", "https://huggingface.co/lodestones/Chroma1-Radiance/tree/main")
            ),

            // ========================
            // VIDEO MODELS
            // ========================

            // --- Recommended ---
            M("Wan 2.1", "video",
                "Best local video model. 14B for quality, 1.3B for speed. CausVid/Lightx2v LoRAs available for faster gen.",
                "DiT", "Alibaba - Wan-AI", "1.3B, 5B, 14B", true,
                D("Comfy Repackaged (FP8/FP16)", "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/diffusion_models"),
                D("Kijai Variants (FP8, LoRAs)", "https://huggingface.co/Kijai/WanVideo_comfy/tree/main"),
                D("T2V 14B GGUF", "https://huggingface.co/city96/Wan2.1-T2V-14B-gguf/tree/main"),
                D("I2V 14B 480p GGUF", "https://huggingface.co/city96/Wan2.1-I2V-14B-480P-gguf/tree/main"),
                D("I2V 14B 720p GGUF", "https://huggingface.co/city96/Wan2.1-I2V-14B-720P-gguf/tree/main"),
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
                D("Comfy Repackaged", "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/diffusion_models"),
                D("GGUF Collection", "https://huggingface.co/collections/QuantStack/wan22-ggufs-6887ec891bdea453a35b95f3"),
                D("Lightning T2V LoRA (High)", "https://huggingface.co/Kijai/WanVideo_comfy/tree/main/LoRAs/Wan22-Lightning"),
                D("Lightx2v I2V LoRA (High)", "https://huggingface.co/Kijai/WanVideo_comfy/tree/main/LoRAs/Wan22_Lightx2v")
            ),

            // --- Modern ---
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
                D("FP8/GGUF (Kijai)", "https://huggingface.co/Kijai/HunyuanVideo_comfy/tree/main"),
                D("GGUF (city96)", "https://huggingface.co/city96/HunyuanVideo-gguf/tree/main"),
                D("FastVideo FP8", "https://huggingface.co/Kijai/HunyuanVideo_comfy/blob/main/hunyuan_video_FastVideo_720_fp8_e4m3fn.safetensors"),
                D("FastVideo GGUF", "https://huggingface.co/city96/FastHunyuan-gguf/tree/main")
            ),

            M("Hunyuan Video 1.5", "video",
                "Faster than v1 thanks to 16x16 VAE. T2V, I2V, and SuperResolution variants.",
                "MMDiT", "Tencent", "8B", false,
                D("All Models (Comfy Repackaged)", "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/tree/main/split_files/diffusion_models"),
                D("Latent Upscale Models", "https://huggingface.co/Comfy-Org/HunyuanVideo_1.5_repackaged/tree/main/split_files/latent_upscale_models")
            ),

            M("LTX Video", "video",
                "Very fast but lower quality. Popular for Image2Video workflows.",
                "DiT", "Lightricks", "3B", false,
                D("All Versions", "https://huggingface.co/Lightricks/LTX-Video/tree/main")
            ),

            M("LTX Video 2", "video",
                "First open source Audio+Video model. 19B, mixed quality but fun.",
                "DiT", "Lightricks", "19B", false,
                D("All Models", "https://huggingface.co/Lightricks/LTX-2/tree/main"),
                D("Spatial Upscaler 2x", "https://huggingface.co/Lightricks/LTX-2/blob/main/ltx-2-spatial-upscaler-x2-1.0.safetensors")
            ),
        ];
    }
}
