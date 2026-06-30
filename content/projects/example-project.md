+++
title = "Double Pendulum Simulation Engine"
description = "A real-time chaotic physics engine using Lagrangian mechanics"
date = "2026-06-20"
weight = 1
extra = { github = "https://github.com/alainux/double-pendulum-sim", math = true }
+++

This project is a real-time double pendulum physics simulation engine developed in WebAssembly and Rust. It calculates chaotic angular motions and renders fractal trajectories in a custom canvas view.

<figure>
  <img src="/images/antigravity_cli_demo.jpg" alt="Pendulum Simulation Diagram" />
  <figcaption>Modular block overview of the simulation architecture and kinetic solver.</figcaption>
</figure>

## Physics Formulation

The motion of a double pendulum is governed by two coupled, non-linear ordinary differential equations. We formulate the kinematics using Lagrangian mechanics:

$$L = T - V$$

Where $T$ is the total kinetic energy and $V$ is the potential energy. For two pendulum rods of length $l_1, l_2$ and masses $m_1, m_2$, the kinetic energy is:

$$T = \frac{1}{2} (m_1 + m_2) l_1^2 \dot{\theta}_1^2 + \frac{1}{2} m_2 l_2^2 \dot{\theta}_2^2 + m_2 l_1 l_2 \dot{\theta}_1 \dot{\theta}_2 \cos(\theta_1 - \theta_2)$$

The potential energy is given by:

$$V = -(m_1 + m_2) g l_1 \cos\theta_1 - m_2 g l_2 \cos\theta_2$$

Solving the Euler-Lagrange equations yields the angular accelerations $\ddot{\theta}_1$ and $\ddot{\theta}_2$, which are solved iteratively in real-time using a 4th-order Runge-Kutta numerical integration solver.

## Simulation CLI Command Options

A CLI interface is provided to configure the physics parameters before running:

| Flag | Parameter | Description |
|------|-----------|-------------|
| `--length` | `l1,l2` | Rod lengths in meters |
| `--mass` | `m1,m2` | Bob masses in kilograms |
| `--gravity` | `g` | Local gravity scale (defaults to 9.81) |

## Core Design Principles

- **Lagrangian Accuracy**: Accurate non-linear differential solvers prevent kinetic energy drift.
- **Wasm Rendering**: Parallelized vector rendering directly target Canvas contexts.
- **Portability**: The simulator binary can compile locally to run on desktop or embedded processors.
