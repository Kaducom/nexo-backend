import type { Variants } from "framer-motion";

export const nexoEase = [0.22, 1, 0.36, 1] as const;

export const pageMotion: Variants = {
  hidden: {
    opacity: 0,
    y: 8
  },

  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.24,
      ease: nexoEase
    }
  },

  exit: {
    opacity: 0,
    y: -4,
    transition: {
      duration: 0.18
    }
  }
};

export const cardMotion: Variants = {
  hidden: {
    opacity: 0,
    y: 6
  },

  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.24,
      ease: nexoEase
    }
  }
};

export const staggerContainer: Variants = {
  hidden: {},

  visible: {
    transition: {
      staggerChildren: 0.025,
      delayChildren: 0.04
    }
  }
};

export const modalMotion: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.97,
    y: 10
  },

  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.25,
      ease: nexoEase
    }
  },

  exit: {
    opacity: 0,
    scale: 0.98,
    y: 6,
    transition: {
      duration: 0.16
    }
  }
};

export const overlayMotion: Variants = {
  hidden: {
    opacity: 0
  },

  visible: {
    opacity: 1,
    transition: {
      duration: 0.18
    }
  },

  exit: {
    opacity: 0,
    transition: {
      duration: 0.15
    }
  }
};

export const hoverLift = {
  y: -2,
  transition: {
    duration: 0.18,
    ease: nexoEase
  }
};

export const tapScale = {
  scale: 0.98
};