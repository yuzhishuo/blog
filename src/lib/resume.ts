export type ResumeEducation = {
  school: string
  degree: string
  major: string
  start: string
  end: string
}

export type ResumeExperience = {
  company: string
  title: string
  start: string
  end: string
  bullets: string[]
}

export type ResumeData = {
  name: string
  age: string
  phone: string
  email: string
  years: string
  intent: string
  city: string
  github?: string
  website?: string
  summary?: string[]
  education: ResumeEducation[]
  experience: ResumeExperience[]
  skills?: string[]
}
