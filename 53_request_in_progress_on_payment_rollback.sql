DROP TRIGGER IF EXISTS trg_request_completed_on_release ON public.milestones;
DROP FUNCTION IF EXISTS public.lyann_mark_request_completed_on_release();
DROP TRIGGER IF EXISTS trg_request_in_progress_on_funding ON public.milestones;
DROP FUNCTION IF EXISTS public.lyann_mark_request_in_progress_on_funding();
